import React, { useState, useCallback, useEffect } from 'react';
import { sessionService } from '../services/api';
import TerminalKeyboard from './TerminalKeyboard';
import './WelcomeScreen.css';

function WelcomeScreen({ onSessionStart, onViewNetwork }) {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (userId.length !== 6) {
      setError('User ID must be exactly 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await sessionService.start(userId);

      if (response.success) {
        onSessionStart(response);
      } else {
        setError(response.message || 'Failed to start session');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Connection error. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = useCallback((key) => {
    if (loading) return;
    setUserId(prev => {
      if (prev.length < 6) {
        setError('');
        return prev + key.toLowerCase();
      }
      return prev;
    });
  }, [loading]);

  const handleBackspace = useCallback(() => {
    setUserId(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const handleClear = () => {
    setUserId('');
    setError('');
  };

  // Physical keyboard support
  useEffect(() => {
    const handlePhysicalKey = (e) => {
      if (loading) return;
      const key = e.key;
      if (/^[a-zA-Z0-9]$/.test(key)) {
        handleKeyPress(key.toUpperCase());
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Delete') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handlePhysicalKey);
    return () => window.removeEventListener('keydown', handlePhysicalKey);
  }, [loading, handleKeyPress, handleBackspace]);

  return (
    <div className="welcome-screen">
      <div className="welcome-container">
        <div className="logo-container">
          <h1 className="project-title">FUTURE HOOMAN</h1>
          <h2 className="terminal-title">EXIT TERMINAL</h2>
        </div>

        <p className="instructions">
          Login with your User ID to access the<br/>
          <span className="terminal-name">EXPERIMENTAL iFLU TRACKING TERMINAL</span>
        </p>

        <div className="user-id-form">
          <div className="input-group">
            <label>User ID:</label>
            <div className="user-id-display">
              <div className="user-id-chars">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <span key={i} className="user-id-char">
                    {userId[i] || '_'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <TerminalKeyboard
            onKeyPress={handleKeyPress}
            onBackspace={handleBackspace}
            onClear={handleClear}
            keysDisabled={userId.length >= 6}
            backspaceDisabled={userId.length === 0}
            showNumbers
          />

          {error && <div className="error-message">{error}</div>}

          <button
            className="begin-button"
            onClick={handleSubmit}
            disabled={loading || userId.length !== 6}
          >
            {loading ? 'CONNECTING...' : 'LOGIN'}
          </button>
        </div>

        <div className="phax-branding">
          <div className="phax-logo">PHAX</div>
          <p className="phax-tagline">DIMENSIONAL CONTAINMENT OPERATIONS</p>
        </div>

        {onViewNetwork && (
          <button className="view-network-btn" onClick={onViewNetwork}>
            ◈ EXPLORE THE XDIM TOPOLOGY VIEW
          </button>
        )}
      </div>
    </div>
  );
}

export default WelcomeScreen;
