import React, { useEffect, useRef } from 'react';
import './TerminalNotice.css';

/**
 * Full-screen modal notice — the loud channel for things a small red line of
 * text under the input was losing (chiefly: "that code didn't work").
 *
 * Two tones:
 *   'error' — invalid / rejected code
 *   'phax'  — the PHAX easter egg
 *
 * Dismisses on click-outside, on the button, and on Escape/Enter, because the
 * kiosk's on-screen keyboard isn't the only way people are typing.
 */
function TerminalNotice({
  tone = 'error',
  headline,
  message,
  detail,
  dismissLabel = 'DISMISS',
  onDismiss,
}) {
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

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
        <button
          ref={buttonRef}
          className="terminal-notice-dismiss"
          onClick={onDismiss}
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}

export default TerminalNotice;
