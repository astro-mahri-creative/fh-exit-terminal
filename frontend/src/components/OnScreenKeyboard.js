import React from 'react';
import TerminalKeyboard from './TerminalKeyboard';
import { isKiosk } from '../kiosk';

// Pushes a value into a React-controlled input the same way a real keystroke
// would: through the native value setter, followed by an `input` event. React
// listens for that event, so the owning component's onChange runs and its state
// stays the single source of truth — no parallel copy of the field's contents.
function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The on-screen keyboard, for the exhibit kiosk only.
 *
 * Renders nothing on phones and laptops — those get the device's own keyboard
 * by way of the plain <input> this component drives.
 *
 * Each instance is bound to exactly one input via `inputRef`. That binding is
 * what removes the old "which field is this keystroke for?" problem: a keyboard
 * can only ever type into its own field, and physical keystrokes are handled
 * natively by whichever input the user actually focused.
 */
function OnScreenKeyboard({
  inputRef,
  value,
  maxLength,
  disabled = false,
  showNumbers = false,
  extraBottomKeys = null,
}) {
  if (!isKiosk()) return null;

  const write = (next) => {
    const el = inputRef.current;
    if (!el || disabled) return;
    setNativeValue(el, next);
    el.focus();
  };

  const atCapacity = maxLength != null && value.length >= maxLength;

  return (
    <TerminalKeyboard
      onKeyPress={(key) => { if (!atCapacity) write(value + key); }}
      onBackspace={() => write(value.slice(0, -1))}
      onClear={() => write('')}
      keysDisabled={disabled || atCapacity}
      backspaceDisabled={disabled || value.length === 0}
      showNumbers={showNumbers}
      extraBottomKeys={extraBottomKeys}
    />
  );
}

export default OnScreenKeyboard;
