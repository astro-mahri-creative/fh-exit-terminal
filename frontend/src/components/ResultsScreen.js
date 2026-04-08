import React, { useState, useEffect, useRef, useCallback } from 'react';
import { emailService } from '../services/api';
import './ResultsScreen.css';

const FIRST_IDLE_TIMEOUT = 30;
const SECOND_IDLE_TIMEOUT = 60;

function ResultsScreen({ resultsData, sessionData, onReset }) {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [countdown, setCountdown] = useState(FIRST_IDLE_TIMEOUT);
  const [idleThreshold, setIdleThreshold] = useState(FIRST_IDLE_TIMEOUT);
  const intervalRef = useRef(null);
  const countdownRef = useRef(FIRST_IDLE_TIMEOUT);
  const lastActivityRef = useRef(Date.now());

  const startIdleTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    lastActivityRef.current = Date.now();
    countdownRef.current = idleThreshold;
    setCountdown(idleThreshold);

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const idleTime = Math.floor((now - lastActivityRef.current) / 1000);

      setCountdown(Math.max(0, idleThreshold - idleTime));

      if (idleTime >= idleThreshold) {
        clearInterval(intervalRef.current);

        // If this was the first idle timeout (30s), reset timer to 60s and continue
        if (idleThreshold === FIRST_IDLE_TIMEOUT) {
          setIdleThreshold(SECOND_IDLE_TIMEOUT);
          lastActivityRef.current = Date.now();
          countdownRef.current = SECOND_IDLE_TIMEOUT;
          setCountdown(SECOND_IDLE_TIMEOUT);
          startIdleTimer();
        } else {
          // Second idle timeout (60s) - auto reset back to home
          onReset();
        }
      }
    }, 1000);
  }, [idleThreshold, onReset]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    startIdleTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startIdleTimer]);

  const getStatusColor = (status) => {
    // Clinical palette — matches CSS custom properties in App.css
    // textColor: dark for light backgrounds, light for dark backgrounds
    const colors = {
      'OPTIMIZED':    { primary: '#b0bec5', secondary: '#78909c', textColor: '#0a0a0a' },
      'ACTIVE':       { primary: '#9e9e9e', secondary: '#616161', textColor: '#0a0a0a' },
      'COMPROMISED':  { primary: '#e6911a', secondary: '#a05c08', textColor: '#0a0a0a' },
      'QUARANTINED':  { primary: '#c94040', secondary: '#7c1a1a', textColor: '#f0eeeb' },
      'LIBERATED':    { primary: '#a0784a', secondary: '#5c3d20', textColor: '#f0eeeb' },
      'TRANSCENDENT': { primary: '#9575cd', secondary: '#4527a0', textColor: '#f0eeeb' }
    };
    return colors[status] || colors.ACTIVE;
  };

  const handleSendEmail = async () => {
    setEmailError('');
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      const response = await emailService.send(sessionData.session_token, email);
      
      if (response.success) {
        setEmailSent(true);
      } else {
        setEmailError(response.message || 'Error sending email');
      }
    } catch (err) {
      setEmailError('Error sending email. Please try again.');
    }
  };

  return (
    <div className="results-screen" onClick={recordActivity} onKeyDown={recordActivity}>
      <div className="phax-alert">
        <div className="alert-icon">⚠️</div>
        <div className="alert-text">{resultsData.phax_alert}</div>
      </div>

      <div className="universe-map">
        <h2>DIMENSIONAL NETWORK STATUS</h2>
        <div className="universes-grid">
          {resultsData.universes.map(universe => {
            const colors = getStatusColor(universe.status);
            return (
              <div
                key={universe.id}
                className="universe-card"
                style={{
                  borderColor: colors.primary + '66',
                  background: `linear-gradient(160deg, ${colors.primary}12, ${colors.secondary}08)`
                }}
              >
                <div className="universe-name">{universe.name}</div>
                <div className="universe-cases">
                  <div className="cases-label">iFLU Cases:</div>
                  <div className="cases-value">
                    {universe.current_cases.toLocaleString()}
                  </div>
                  {universe.change !== 0 && (
                    <div className={`cases-change ${universe.change > 0 ? 'increase' : 'decrease'}`}>
                      {universe.change > 0 ? '+' : ''}{universe.change.toLocaleString()}
                    </div>
                  )}
                </div>
                <div
                  className="universe-status"
                  style={{ backgroundColor: colors.primary, color: colors.textColor }}
                >
                  {universe.status}
                </div>
              </div>
            );
          })}
        </div>
        
        {resultsData.cure_active && (
          <div className="cure-indicator">
            🧬 CURE PROTOCOL ACTIVE
          </div>
        )}
      </div>

      <div className="impact-summary">
        <h3>YOUR IMPACT</h3>
        <p className="alignment-narrative">{resultsData.alignment_narrative}</p>
        <div className="stats">
          <div className="stat">
            <span className="stat-label">Codes Entered:</span>
            <span className="stat-value">{resultsData.total_codes_entered}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Alignment Score:</span>
            <span className={`stat-value ${resultsData.alignment_score < 0 ? 'phax' : 'fheels'}`}>
              {resultsData.alignment_score > 0 ? '+' : ''}{resultsData.alignment_score}
            </span>
          </div>
        </div>
      </div>

      <div className="email-section">
        {!emailSent ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); recordActivity(); }}
              placeholder="Enter email address"
              className="email-input"
            />
            {emailError && <div className="error-message">{emailError}</div>}
            <div className="action-buttons">
              <button onClick={handleSendEmail} className="send-button">
                SEND IMPACT REPORT
              </button>
              <button onClick={onReset} className="reset-button">
                RETURN TO HOME
              </button>
            </div>
          </>
        ) : (
          <div className="email-success">
            ✓ Impact report sent to {email}
            <button onClick={onReset} className="reset-button">
              RETURN TO HOME
            </button>
          </div>
        )}
      </div>

      <div className="countdown">
        Auto-reset in {countdown}s
      </div>
    </div>
  );
}

export default ResultsScreen;
