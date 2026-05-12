import { useEffect, useRef, useState } from 'react';
import { universeService } from '../services/api';

// Polls /api/universes on an interval and tracks per-universe currentCases
// deltas across polls so consumers can drive count-up animations.
//
// Returns { universes, deltas, lastChangedAt, loading, error }:
//   universes      — array sorted by displayOrder (or [] before first arrival).
//   deltas         — { [universeId]: number } — change since previous poll.
//                    0 when unchanged. 0 for every universe on first arrival.
//   lastChangedAt  — { [universeId]: Date } — wall-clock time of the most
//                    recent non-zero delta. Persists between polls until the
//                    universe changes again.
//   loading        — true until the first response (success or error) lands.
//   error          — last error message or null.
//
// Skips polling while document.visibilityState === 'hidden'.
export default function useUniverses(intervalMs = 10000) {
  const [universes, setUniverses] = useState([]);
  const [deltas, setDeltas] = useState({});
  const [lastChangedAt, setLastChangedAt] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const prevCasesRef = useRef({});
  const lastChangedRef = useRef({});

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const data = await universeService.getAll();
        if (cancelled || !data?.success) {
          if (!cancelled && !data?.success) setError('Failed to load universes');
          return;
        }
        const list = data.universes || [];
        const nextDeltas = {};
        const now = new Date();
        let anyChange = false;
        for (const u of list) {
          const id = u._id;
          const prev = prevCasesRef.current[id];
          const cur = u.currentCases ?? 0;
          const delta = prev === undefined ? 0 : cur - prev;
          nextDeltas[id] = delta;
          prevCasesRef.current[id] = cur;
          if (delta !== 0) {
            lastChangedRef.current[id] = now;
            anyChange = true;
          }
        }
        if (cancelled) return;
        setUniverses(list);
        setDeltas(nextDeltas);
        if (anyChange) setLastChangedAt({ ...lastChangedRef.current });
        setError(null);
      } catch (e) {
        if (!cancelled) setError('Unable to connect to universes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);

  return { universes, deltas, lastChangedAt, loading, error };
}
