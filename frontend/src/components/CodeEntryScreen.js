import React, { useState } from 'react';
import { codeService, adminService } from '../services/api';
import './CodeEntryScreen.css';

function CodeEntryScreen({ sessionData, onFinalize }) {
  const [currentCode, setCurrentCode] = useState('');
  const [activatedCodes, setActivatedCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showActivation, setShowActivation] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');

  const isAdmin = sessionData.is_admin;

  const keyboard = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  const handleKeyPress = (key) => {
    if (currentCode.length < 4) {
      setCurrentCode(currentCode + key);
      setError('');
    }
  };

  const handleClear = () => {
    setCurrentCode('');
    setError('');
  };

  const handleActivateCode = async () => {
    if (currentCode.length !== 4) {
      setError('Code must be exactly 4 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await codeService.validate(sessionData.session_token, currentCode);
      
      if (response.success && response.valid) {
        // Show activation animation
        setShowActivation(true);
        setTimeout(() => setShowActivation(false), 1500);
        
        // Add to activated codes
        setActivatedCodes([...activatedCodes, {
          code: response.code,
          name: response.code_name,
          tier: response.code_tier
        }]);
        
        // Clear input
        setCurrentCode('');
      } else {
        setError(response.message || 'Invalid code');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Error validating code';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (activatedCodes.length === 0) {
      setError('Please enter at least one code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await codeService.finalize(sessionData.session_token);
      
      if (response.success) {
        onFinalize(response);
      } else {
        setError(response.message || 'Error processing codes');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Error finalizing codes';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateUserId = async () => {
    try {
      const response = await adminService.generateUserId(sessionData.session_token);
      if (response.success) {
        setNewUserId(response.user_id);
      }
    } catch (err) {
      alert('Error generating user ID');
    }
  };

  const handleResetUniverses = async () => {
    if (window.confirm('WARNING: This will reset all universe data. Continue?')) {
      try {
        const response = await adminService.resetUniverses(sessionData.session_token);
        if (response.success) {
          alert('Universe statistics reset complete');
        }
      } catch (err) {
        alert('Error resetting universes');
      }
    }
  };

  return (
    <div className="code-entry-screen">
      <div className="header">
        <h2>TERMINAL CODE ENTRY</h2>
        <div className="user-info">User: {sessionData.session_token.substring(5, 11)}</div>
      </div>

      {isAdmin && (
        <div className="admin-controls">
          <button onClick={() => setAdminPanelOpen(!adminPanelOpen)} className="admin-toggle">
            {adminPanelOpen ? '▼' : '▶'} ADMIN MODE
          </button>
          {adminPanelOpen && (
            <div className="admin-panel">
              <button onClick={handleGenerateUserId} className="admin-button">
                Generate User ID
              </button>
              <button onClick={handleResetUniverses} className="admin-button danger">
                Reset Universe Statistics
              </button>
              {newUserId && (
                <div className="new-user-id">
                  <strong>New User ID:</strong> {newUserId}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="main-content">
        <div className="code-input-section">
          <div className="code-display">
            <div className="code-input-box">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className="code-char">
                  {currentCode[i] || '_'}
                </span>
              ))}
            </div>
          </div>

          <div className="keyboard">
            {keyboard.map((row, rowIndex) => (
              <div key={rowIndex} className="keyboard-row">
                {row.map(key => (
                  <button
                    key={key}
                    onClick={() => handleKeyPress(key)}
                    className="keyboard-key"
                    disabled={currentCode.length >= 4}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
            <div className="keyboard-row">
              <button onClick={handleClear} className="keyboard-key clear-key">
                CLEAR
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            onClick={handleActivateCode}
            className="activate-button"
            disabled={loading || currentCode.length !== 4}
          >
            {loading ? 'PROCESSING...' : 'ACTIVATE CODE'}
          </button>
        </div>

        <div className="activated-codes-section">
          <h3>ACTIVATED CODES</h3>
          <div className="codes-list">
            {activatedCodes.length === 0 ? (
              <p className="no-codes">No codes activated yet</p>
            ) : (
              activatedCodes.map((code, index) => (
                <div key={index} className="activated-code-item">
                  <span className="code-value">{code.code}</span>
                  <span className="code-tier">Tier {code.tier}</span>
                </div>
              ))
            )}
          </div>
          <div className="code-count">
            Count: {activatedCodes.length}
          </div>
        </div>
      </div>

      <button 
        onClick={handleFinalize}
        className="finalize-button"
        disabled={loading || activatedCodes.length === 0}
      >
        {loading ? 'PROCESSING...' : 'FINALIZE TERMINAL CODE ENTRY'}
      </button>

      {showActivation && (
        <div className="activation-overlay">
          <div className="activation-message">
            TERMINAL CODE ACTIVATED
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeEntryScreen;
