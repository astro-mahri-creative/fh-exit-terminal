import React from 'react';
import './TerminalKeyboard.css';

const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

function TerminalKeyboard({
  onKeyPress,
  onBackspace,
  onClear,
  keysDisabled = false,
  backspaceDisabled = false,
  showNumbers = false,
  extraBottomKeys = null, // { left: '@', right: '.' }
}) {
  const rows = [];
  const specialKeys = new Set();

  if (showNumbers) {
    rows.push(NUMBER_ROW);
  }

  // Add letter rows, injecting extra keys into the bottom row
  LETTER_ROWS.forEach((row, i) => {
    if (i === LETTER_ROWS.length - 1 && extraBottomKeys) {
      const built = [];
      if (extraBottomKeys.left) { built.push(extraBottomKeys.left); specialKeys.add(extraBottomKeys.left); }
      built.push(...row);
      if (extraBottomKeys.right) { built.push(extraBottomKeys.right); specialKeys.add(extraBottomKeys.right); }
      rows.push(built);
    } else {
      rows.push(row);
    }
  });

  return (
    <div className="keyboard">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="keyboard-row">
          {row.map(key => (
            <button
              key={key}
              onClick={() => onKeyPress(key)}
              className={`keyboard-key${specialKeys.has(key) ? ' special-key' : ''}`}
              disabled={keysDisabled}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className="keyboard-row">
        <button onClick={onClear} className="keyboard-key clear-key">
          CLEAR
        </button>
        <button
          onClick={onBackspace}
          className="keyboard-key backspace-key"
          disabled={backspaceDisabled}
        >
          &#9003;
        </button>
      </div>
    </div>
  );
}

export default TerminalKeyboard;
