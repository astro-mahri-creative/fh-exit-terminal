import React from 'react';
import useUniverses from '../hooks/useUniverses';
import TVWallCell from './TVWallCell';
import './TVWallScreen.css';

const GRID_CELLS = 9;

// Display-only kiosk view: 4:3 wall, 3×3 grid, each cell shows one universe
// in isolation. Polls /api/universes every 10s. See plan file for rationale.
export default function TVWallScreen() {
  const { universes, deltas, lastChangedAt, loading, error } = useUniverses(10000);

  // Universes arrive sorted by displayOrder from the API. Slice to 9 — the
  // physical wall only has 9 CRTs. After the seed change, the DB should
  // produce exactly 9. The slice + pad below is defensive for transient
  // states (e.g. mid-deploy with the old seed).
  const padded = Array.from({ length: GRID_CELLS }, (_, i) => universes[i] || null);

  if (loading) {
    return (
      <div className="tv-wall-stage">
        <div className="tv-wall">
          {Array.from({ length: GRID_CELLS }, (_, i) => (
            <div key={i} className="tv-wall-cell">
              <div className="tv-wall-cell__panel terminal-panel">
                <div className="network-status">SYNCING&hellip;</div>
              </div>
              <div className="tv-wall-cell__canvas" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tv-wall-stage">
      <div className="tv-wall">
        {padded.map((u, i) => (
          <TVWallCell
            key={u?._id ?? `slot-${i}`}
            universe={u}
            variantIndex={i}
            delta={u ? (deltas[u._id] ?? 0) : 0}
            lastChangedAt={u ? lastChangedAt[u._id] : null}
          />
        ))}
      </div>
      {error && <div className="network-status error tv-wall-error">{error}</div>}
    </div>
  );
}
