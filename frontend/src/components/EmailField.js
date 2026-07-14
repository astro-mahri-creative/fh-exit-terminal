import React, { useRef } from 'react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { isKiosk } from '../kiosk';
import './EmailField.css';

const MAX_EMAIL_LENGTH = 127;

/**
 * Email entry, shared by the Save Progress gate and the impact report.
 *
 * A real <input type="email">, so phones offer autofill and an email-optimized
 * keyboard. On the kiosk the OS keyboard is suppressed and the bundled
 * on-screen keyboard — which carries the "@" and "." keys — drives it instead.
 */
function EmailField({
  id,
  value,
  onChange,
  onEnter,
  disabled = false,
  autoFocus = false,
  placeholder = 'enter email address',
  ariaLabel = 'Email address',
  // Rendered beside the input (e.g. a CONFIRM button). Kept inside this
  // component so the on-screen keyboard always sits below the whole row
  // rather than becoming a sibling of the button.
  trailing = null,
}) {
  const inputRef = useRef(null);

  return (
    <div className="email-field">
      <div className="email-field-row">
        <input
          id={id}
          ref={inputRef}
          type="email"
          className="email-input"
          value={value}
          maxLength={MAX_EMAIL_LENGTH}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value.toLowerCase().trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) onEnter();
          }}
          inputMode={isKiosk() ? 'none' : 'email'}
          autoComplete="email"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {trailing}
      </div>
      <OnScreenKeyboard
        inputRef={inputRef}
        value={value}
        maxLength={MAX_EMAIL_LENGTH}
        disabled={disabled}
        showNumbers
        extraBottomKeys={{ left: '@', right: '.' }}
      />
    </div>
  );
}

export default EmailField;
