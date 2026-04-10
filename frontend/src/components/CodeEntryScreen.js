import React, { useState, useEffect, useCallback } from 'react';
import { codeService } from '../services/api';
import AdminPanel from './AdminPanel';
import './CodeEntryScreen.css';

function CodeEntryScreen({ sessionData, onPreview, onLogout }) {
  const [currentCode, setCurrentCode] = useState('');
  const [activatedCodes, setActivatedCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showActivation, setShowActivation] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [showTransmitConfirm, setShowTransmitConfirm] = useState(false);

  const isAdmin = sessionData.is_admin;

  const keyboard = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
  ];

  const handleKeyPress = useCallback((key) => {
    if (loading) return;
    setCurrentCode(prev => {
      if (prev.length < 4) {
        setError('');
        return prev + key;
      }
      return prev;
    });
  }, [loading]);

  const handleBackspace = useCallback(() => {
    setCurrentCode(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const handleClear = () => {
    setCurrentCode('');
    setError('');
  };

  // Physical keyboard support
  useEffect(() => {
    const handlePhysicalKey = (e) => {
      if (loading) return;
      const key = e.key.toUpperCase();
      if (/^[A-Z0-9]$/.test(key)) {
        handleKeyPress(key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Delete') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handlePhysicalKey);
    return () => window.removeEventListener('keydown', handlePhysicalKey);
  }, [loading, handleKeyPress, handleBackspace]);

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
        setTimeout(() => setShowActivation(false), 1800);
        
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
      const response = await codeService.preview(sessionData.session_token);

      if (response.success) {
        onPreview(response);
      } else {
        setError(response.message || 'Error processing codes');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Error previewing codes';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="code-entry-screen">
      <div className="header">
        <h2>TERMINAL CODE ENTRY</h2>
        <div className="header-right">
          <div className="user-info">Your ID: {sessionData.user_id}</div>
          <button onClick={onLogout} className="logout-button">LOG OUT</button>
        </div>
      </div>

      {isAdmin && (
        <div className="admin-controls">
          <button onClick={() => setAdminPanelOpen(!adminPanelOpen)} className="admin-toggle">
            {adminPanelOpen ? '▼' : '▶'} ADMIN MODE
          </button>
          {adminPanelOpen && (
            <AdminPanel sessionData={sessionData} />
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
              <button
                onClick={handleBackspace}
                className="keyboard-key backspace-key"
                disabled={currentCode.length === 0}
              >
                &#9003;
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="action-row">
          <button
            onClick={handleActivateCode}
            className="activate-button"
            disabled={loading || currentCode.length !== 4}
          >
            {loading ? 'PROCESSING...' : 'ACTIVATE CODE'}
          </button>
          <button
            onClick={() => setShowTransmitConfirm(true)}
            className="proceed-button"
            disabled={loading || activatedCodes.length === 0}
          >
            {loading ? 'PROCESSING...' : 'TRANSMIT CODES'}
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
            Codes activated: {activatedCodes.length}
          </div>
        </div>
      </div>

      {showActivation && (
        <div className="activation-overlay">
          <div className="activation-message">
            <div>iFLU SIGNATURE</div>
            <div>PROCESSING COMPLETED</div>
          </div>
        </div>
      )}

      {showTransmitConfirm && (
        <div className="transmit-confirm-overlay">
          <div className="transmit-confirm-dialog">
            <div className="transmit-confirm-title">CONFIRM TRANSMISSION</div>
            <p className="transmit-confirm-text">
              Have you activated all of your codes?
            </p>
            <div className="transmit-confirm-count">
              {activatedCodes.length} code{activatedCodes.length !== 1 ? 's' : ''} activated
            </div>
            <div className="transmit-confirm-actions">
              <button
                className="transmit-confirm-back"
                onClick={() => setShowTransmitConfirm(false)}
              >
                KEEP ENTERING CODES
              </button>
              <button
                className="transmit-confirm-go"
                onClick={() => { setShowTransmitConfirm(false); handleFinalize(); }}
              >
                TRANSMIT NOW
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeEntryScreen;
