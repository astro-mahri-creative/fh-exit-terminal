import { useEffect, useState } from 'react';

// Tick from `from` toward `to` through `steps` discrete intermediate values
// (plus a final settle to `to`). Each tick holds for `stepDurationMs`. When
// `enabled` is false or there's no change, sits at `to` and never animates.
// Adds light jitter to intermediates so the sequence feels like a calculating
// readout instead of a math-perfect interpolation.
export default function useSteppedCountUp(
  from,
  to,
  steps,
  stepDurationMs,
  enabled,
  delayMs = 0,
) {
  // Pre-animation we display the original (`from`) value so users see the
  // pre-event state immediately. Once `enabled` flips, the effect kicks off
  // the staircase tick from `from` to `to`.
  const [value, setValue] = useState(enabled ? to : from);

  useEffect(() => {
    if (from === to) {
      setValue(to);
      return undefined;
    }
    if (!enabled) {
      // Pre-animation: park at the original value so the user sees the
      // pre-event state until the animation triggers.
      setValue(from);
      return undefined;
    }

    setValue(from);
    const timeouts = [];

    timeouts.push(
      setTimeout(() => {
        for (let i = 1; i <= steps; i++) {
          timeouts.push(
            setTimeout(() => {
              const t = i / (steps + 1);
              const eased = 1 - Math.pow(1 - t, 3);
              const base = from + (to - from) * eased;
              const jitter = (Math.random() - 0.5) * Math.abs(to - from) * 0.04;
              setValue(Math.round(base + jitter));
            }, i * stepDurationMs),
          );
        }
        timeouts.push(
          setTimeout(() => setValue(to), (steps + 1) * stepDurationMs),
        );
      }, delayMs),
    );

    return () => timeouts.forEach(clearTimeout);
  }, [from, to, steps, stepDurationMs, enabled, delayMs]);

  return value;
}
