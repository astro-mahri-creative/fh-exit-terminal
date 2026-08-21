import React, { useMemo } from 'react';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import { colorsFor, STATUS_THRESHOLDS } from './universeStatusColors';
import './UniverseImpactChart.css';

// Matches the count-up cadence used by the universe cards so the numbers on
// the chart and the numbers on the cards move together.
const COUNT_STEPS = 5;
const COUNT_STEP_MS = 670;
const COLUMN_STAGGER_MS = 60;

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

// A universe's cases as a share of its own initialization count — the scale
// that makes a 19k-case universe and a 2.5M-case one comparable, and the same
// ratio the status thresholds are defined against.
const toPercent = (cases, denominator) => {
  if (!denominator) return 0;
  return Math.max(0, Math.min(100, (cases / denominator) * 100));
};

function ImpactBar({ universe, denominator, animate, index }) {
  const colors = colorsFor(universe.status);
  const current = universe.current_cases;
  const change = universe.change || 0;
  const previous = universe.previous_cases ?? current - change;

  const currentPct = toPercent(current, denominator);
  const previousPct = toPercent(previous, denominator);

  const animatedCases = useSteppedCountUp(
    previous,
    current,
    COUNT_STEPS,
    COUNT_STEP_MS,
    animate,
    index * COLUMN_STAGGER_MS,
  );

  // Height is the animation: the bar sits at its pre-transmission level until
  // `animate` flips, then grows or drops to the new one over the same window
  // the count-up runs in. CSS does the interpolation.
  const height = animate ? currentPct : previousPct;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <div className="impact-bar-column">
      <div className="impact-bar-track">
        {/* Where this universe started, left behind as a reference line once
            the bar has moved away from it. */}
        {change !== 0 && (
          <div
            className={`impact-bar-origin ${direction}`}
            style={{ bottom: `${previousPct}%` }}
            aria-hidden="true"
          />
        )}

        <div
          className={`impact-bar ${direction}`}
          style={{
            height: `${height}%`,
            background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary})`,
            boxShadow: `0 0 14px ${colors.primary}55`,
            transitionDelay: `${index * COLUMN_STAGGER_MS}ms`,
          }}
        >
          <div className="impact-bar-cap" style={{ background: colors.primary }} />
        </div>

        {/* Rides the top of the bar, but stops short of the ceiling — a
            near-100% bar would otherwise push its own number off the plot. */}
        <div
          className={`impact-bar-value ${animate ? 'visible' : ''}`}
          style={{
            bottom: `calc(${Math.min(height, 84)}% + 6px)`,
            transitionDelay: `${index * COLUMN_STAGGER_MS}ms`,
          }}
        >
          <span className="impact-value-full">{animatedCases.toLocaleString()}</span>
          <span className="impact-value-compact">{compact.format(animatedCases)}</span>
          {change !== 0 && (
            <span className={`impact-bar-delta ${direction}`}>
              {change > 0 ? '▲ +' : '▼ '}{change.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="impact-bar-label">
        <span className="impact-bar-name">{universe.name}</span>
        <span
          className="impact-bar-status"
          style={{ background: colors.primary, color: colors.textColor }}
        >
          {universe.status}
        </span>
      </div>
    </div>
  );
}

/**
 * Vertical bar chart of every universe's iFLU load, scaled 0–100% of that
 * universe's own initialization count, animating from its pre-transmission
 * level to its post-transmission one.
 *
 * This is the "what did I just do to the multiverse" view: bar colour carries
 * status, bar height carries saturation, and the movement between the two
 * levels is the impact itself.
 */
function UniverseImpactChart({ universes = [], animate = false }) {
  // Preserve the network's display order rather than sorting by impact — the
  // chart is a picture of the whole board, and a stable left-to-right order is
  // what lets someone compare it against the cards below or a previous visit.
  const rows = useMemo(() => universes.slice(), [universes]);

  // Fallback for payloads that predate initialization_cases: scale everything
  // against the largest count on the board so the chart still says something
  // true about relative load.
  const globalMax = useMemo(
    () => Math.max(1, ...universes.map(u => Math.max(u.current_cases || 0, u.previous_cases || 0))),
    [universes],
  );

  if (rows.length === 0) return null;

  const totalChange = rows.reduce((sum, u) => sum + (u.change || 0), 0);

  return (
    <div className="universe-impact-chart">
      <div className="impact-chart-header">
        <h3 className="impact-chart-title">iFLU SATURATION BY UNIVERSE</h3>
        <div className={`impact-chart-net ${totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : ''}`}>
          NET {totalChange > 0 ? '+' : ''}{totalChange.toLocaleString()} CASES
        </div>
      </div>

      <div className="impact-chart-body">
        {/* Each label is pinned to its own gridline's percentage rather than
            distributed by flexbox — evenly spacing five labels of nonzero
            height drifts a few pixels further off the line with every step. */}
        <div className="impact-chart-axis" aria-hidden="true">
          {[100, 75, 50, 25, 0].map(tick => (
            <div key={tick} className="impact-axis-tick" style={{ bottom: `${tick}%` }}>{tick}%</div>
          ))}
        </div>

        <div className="impact-chart-plot">
          {[100, 75, 50, 25, 0].map(tick => (
            <div key={tick} className="impact-gridline" style={{ bottom: `${tick}%` }} aria-hidden="true" />
          ))}

          {/* The two lines a universe's status flips across. */}
          {STATUS_THRESHOLDS.map(t => (
            <div
              key={t.label}
              className="impact-threshold"
              style={{ bottom: `${t.pct}%`, borderColor: `${t.color}66` }}
              aria-hidden="true"
            >
              <span className="impact-threshold-label" style={{ color: t.color }}>{t.label}</span>
            </div>
          ))}

          <div className="impact-bars">
            {rows.map((universe, idx) => (
              <ImpactBar
                key={universe.id || universe.name}
                universe={universe}
                denominator={universe.initialization_cases || globalMax}
                animate={animate}
                index={idx}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="impact-chart-footnote">
        Each bar is that universe's iFLU cases as a share of its own capacity.
        Bars move from their level before your transmission to the level you left them at.
      </p>
    </div>
  );
}

export default UniverseImpactChart;
