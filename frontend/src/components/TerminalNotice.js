import React, { useEffect, useRef } from 'react';
import './TerminalNotice.css';

/**
 * Full-screen modal notice — the loud channel for things a small red line of
 * text under the input was losing (chiefly: "that code didn't work").
 *
 * Three tones:
 *   'error'  — invalid / rejected code
 *   'phax'   — the PHAX easter egg
 *   'prompt' — an ask rather than a report (the save-progress nudge)
 *
 * By default it carries one dismiss button. Pass `actions` for a real choice;
 * the first entry is the affirmative one and takes the accent colour.
 *
 * Dismisses on click-outside and on Escape. Enter dismisses only a
 * single-button notice — on a choice, guessing which option the user meant
 * would be worse than making them look.
 */
function TerminalNotice({
  tone = 'error',
  headline,
  message,
  detail,
  dismissLabel = 'DISMISS',
  actions = null,
  onDismiss,
}) {
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && !actions)) {
        e.preventDefault();
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, actions]);

  return (
    <div className={`terminal-notice-overlay tone-${tone}`} onClick={onDismiss}>
      <div
        className="terminal-notice-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={headline || message}
        onClick={(e) => e.stopPropagation()}
      >
        {headline && <div className="terminal-notice-headline">{headline}</div>}
        <p className="terminal-notice-message">{message}</p>
        {detail && <div className="terminal-notice-detail">{detail}</div>}
        {actions ? (
          <div className="terminal-notice-actions">
            {actions.map((action, i) => (
              <button
                key={action.label}
                ref={i === 0 ? buttonRef : undefined}
                className={`terminal-notice-action${i === 0 ? ' primary' : ''}`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            ref={buttonRef}
            className="terminal-notice-dismiss"
            onClick={onDismiss}
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default TerminalNotice;
