import React from 'react';
import { isKiosk } from '../kiosk';
import './SegmentedInput.css';

/**
 * The character-cell fields (User ID, code) as a real text input.
 *
 * The cells stay exactly as they were — they are just presentation now. A
 * transparent, full-size <input> sits on top of them and holds the actual
 * value, which buys us native focus, native caret movement, native physical
 * typing, and the device's own keyboard on phones. On the kiosk we suppress
 * that soft keyboard with inputMode="none" and drive the field from the
 * on-screen keyboard instead.
 */
function SegmentedInput({
  id,
  length,
  value,
  onChange,
  onEnter,
  inputRef,
  cellClassName,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  placeholderChar = '_',
}) {
  const cells = Array.from({ length }, (_, i) => value[i] || placeholderChar);

  return (
    <div className="segmented-input">
      <div className="segmented-cells" aria-hidden="true">
        {cells.map((ch, i) => (
          <span
            key={i}
            className={`${cellClassName}${i === value.length && !disabled ? ' segmented-cell-active' : ''}`}
          >
            {ch}
          </span>
        ))}
      </div>
      <input
        id={id}
        ref={inputRef}
        className="segmented-native"
        type="text"
        value={value}
        maxLength={length}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
        // The kiosk has no OS keyboard and must not summon one; every other
        // device should get its native keyboard the moment the field is tapped.
        inputMode={isKiosk() ? 'none' : 'text'}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}

export default SegmentedInput;
