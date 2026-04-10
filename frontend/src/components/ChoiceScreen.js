import React, { useState } from 'react';
import { codeService } from '../services/api';
import './ChoiceScreen.css';

function ChoiceScreen({ choiceData, sessionData, onChoiceConfirmed }) {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSelect = (choice) => {
    setSelectedChoice(choice);
    setShowConfirmation(true);
    setError('');
  };

  const handleCancel = () => {
    setSelectedChoice(null);
    setShowConfirmation(false);
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await codeService.finalize(sessionData.session_token, selectedChoice);
      if (response.success) {
        onChoiceConfirmed(response);
      } else {
        setError(response.message || 'Error processing choice');
        setShowConfirmation(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error finalizing codes');
      setShowConfirmation(false);
    } finally {
      setLoading(false);
    }
  };

  const optionA = choiceData.option_a;
  const optionB = choiceData.option_b;
  const optionADisabled = optionA.net_change === 0;
  const optionBDisabled = optionB.net_change === 0;
  const selectedOption = selectedChoice === 'a' ? optionA : optionB;

  return (
    <div className="choice-screen">
      <div className="choice-header">
        <h2>AWAITING OPERATOR DIRECTIVE</h2>
        <p className="choice-subtitle">
          PROTOCOL SELECTION WARNING · SINGULAR VECTOR REQUIREMENT NOT MET
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="options-grid">
        <div
          className={`option-panel option-a ${selectedChoice === 'a' ? 'selected' : ''} ${optionADisabled ? 'disabled' : ''}`}
          onClick={() => !loading && !optionADisabled && handleSelect('a')}
        >
          <span className="hack-flash hack-flash-top">SYS_OVERRIDE::ACTIVE</span>
          <span className="hack-flash hack-flash-bottom">BACKDOOR_v2.7.1</span>
          <div className="option-label">OPTION A</div>
          <h3 className="option-title">{optionA.label}</h3>
          <p className="option-description">{optionA.description}</p>

          <div className="option-universes">
            {optionA.universes.filter(u => u.change !== 0).map(u => (
              <div key={u.id} className="option-universe-row">
                <span className="universe-name">{u.name}</span>
                <span className="universe-delta negative">
                  {u.change.toLocaleString()} <span className="unit-label">cases</span>
                </span>
              </div>
            ))}
            {optionA.universes.every(u => u.change === 0) && (
              <div className="no-effects">No iFLU containment effects detected</div>
            )}
          </div>

          <div className="net-change negative">
            <span className="net-label">NET iFLU IMPACT</span>
            <span className="net-value">
              {optionA.net_change.toLocaleString()} <span className="unit-label">cases</span>
            </span>
          </div>

          <button className="select-button select-a" disabled={loading || optionADisabled}>
            {optionADisabled ? 'NO EFFECTS AVAILABLE' : 'SELECT iFLU CONTAINMENT'}
          </button>
        </div>

        <div className="options-divider">
          <span>OR</span>
        </div>

        <div
          className={`option-panel option-b ${selectedChoice === 'b' ? 'selected' : ''} ${optionBDisabled ? 'disabled' : ''}`}
          onClick={() => !loading && !optionBDisabled && handleSelect('b')}
        >
          <span className="hack-flash hack-flash-top">XPLOIT_CHANNEL::OPEN</span>
          <span className="hack-flash hack-flash-bottom">FHEELS_INJECT_0x4F</span>
          <div className="option-label">OPTION B</div>
          <h3 className="option-title">{optionB.label}</h3>
          <p className="option-description">{optionB.description}</p>

          <div className="option-universes">
            {optionB.universes.filter(u => u.change !== 0).map(u => (
              <div key={u.id} className="option-universe-row">
                <span className="universe-name">{u.name}</span>
                <span className="universe-delta positive">
                  +{u.change.toLocaleString()} <span className="unit-label">cases</span>
                </span>
              </div>
            ))}
            {optionB.universes.every(u => u.change === 0) && (
              <div className="no-effects">No iFLU proliferation effects detected</div>
            )}
          </div>

          <div className="net-change positive">
            <span className="net-label">NET iFLU IMPACT</span>
            <span className="net-value">
              +{optionB.net_change.toLocaleString()} <span className="unit-label">cases</span>
            </span>
          </div>

          <button className="select-button select-b" disabled={loading || optionBDisabled}>
            {optionBDisabled ? 'NO EFFECTS AVAILABLE' : 'SELECT iFLU PROLIFERATION'}
          </button>
        </div>
      </div>

      <div className="codes-summary">
        Codes activated: {choiceData.total_codes_entered}
      </div>

      {showConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h3>CONFIRM SELECTION</h3>
            <p className="confirm-option-name">
              {selectedOption.label}
            </p>
            <p className="confirm-description">
              Net impact: <strong>{selectedChoice === 'a' ? '' : '+'}{selectedOption.net_change.toLocaleString()}</strong> cases across XDIM network
            </p>
            <div className="confirm-buttons">
              <button
                onClick={handleConfirm}
                className={`confirm-button ${selectedChoice === 'a' ? 'confirm-a' : 'confirm-b'}`}
                disabled={loading}
              >
                {loading ? 'PROCESSING...' : 'CONFIRM'}
              </button>
              <button
                onClick={handleCancel}
                className="cancel-button"
                disabled={loading}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChoiceScreen;
