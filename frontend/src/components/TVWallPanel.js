import React from 'react';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import {
  STEPPED_COUNT_STEPS,
  STEPPED_COUNT_DURATION_MS,
  STATUS_COLORS,
} from './universeVariants';

function formatTime(date) {
  if (!date) return null;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// At/above 1M, abbreviate as `X.XXX M` rounded UP to 3 decimals so the panel
// never overflows. Below 1M we keep the full count for fidelity.
function formatCases(n) {
  if (n >= 1_000_000) {
    return (Math.ceil(n / 1000) / 1000).toFixed(3) + ' M';
  }
  return n.toLocaleString();
}

// HTML info panel for one TV Wall cell. The 3D sculpture is rendered
// separately into the wall's single shared canvas (see TVWallSculpture).
export default function TVWallPanel({ universe, delta = 0, lastChangedAt, loading = false }) {
  // Called unconditionally so hook order is stable across loading / no-signal /
  // active states.
  const safeCurrent = universe?.currentCases ?? 0;
  const displayedCases = useSteppedCountUp(
    safeCurrent - delta,
    safeCurrent,
    STEPPED_COUNT_STEPS,
    STEPPED_COUNT_DURATION_MS,
    !!universe && delta !== 0,
    0,
  );

  if (loading) {
    return (
      <div className="tv-wall-cell__panel terminal-panel">
        <div className="network-status">SYNCING…</div>
      </div>
    );
  }

  // NO-SIGNAL placeholder when this cell has no universe assigned.
  if (!universe) {
    return (
      <div className="tv-wall-cell__panel terminal-panel">
        <div className="tv-wall-cell__name" style={{ color: 'var(--text-dim)' }}>—</div>
        <div className="tv-wall-cell__status" style={{ color: 'var(--text-dim)' }}>NO SIGNAL</div>
      </div>
    );
  }

  const color = STATUS_COLORS[universe.status] || STATUS_COLORS.COMPROMISED;

  const deltaClass =
    delta > 0 ? 'cases-up'
    : delta < 0 ? 'cases-down'
    : '';
  const deltaSign = delta > 0 ? '+' : '';
  const lastChangedLabel = formatTime(lastChangedAt);

  return (
    <div className="tv-wall-cell__panel terminal-panel">
      <div>
        <div className="tv-wall-cell__name" style={{ color }}>{universe.name}</div>
        <div className="tv-wall-cell__sublabel">DIMENSION ID</div>
      </div>

      <div>
        <div className={`tv-wall-cell__cases ${deltaClass}`}>
          {formatCases(displayedCases)}
        </div>
        <div className="tv-wall-cell__cases-unit">iFLU CASES</div>
        <div className="tv-wall-cell__delta">
          {delta !== 0
            ? <>{delta > 0 ? '▲' : '▼'} {deltaSign}{delta.toLocaleString()} at {lastChangedLabel}</>
            : lastChangedLabel
              ? <>· last {lastChangedLabel}</>
              : <>· idle</>}
        </div>
      </div>

      <div className="tv-wall-cell__status" style={{ color }}>{universe.status}</div>
    </div>
  );
}
