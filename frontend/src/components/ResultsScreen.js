import React, { useState, useEffect } from 'react';
import { emailService } from '../services/api';
import './ResultsScreen.css';

function ResultsScreen({ resultsData, sessionData, onReset }) {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getStatusColor = (status) => {
    const colors = {
      'OPTIMIZED': { primary: '#C0C0C0', secondary: '#0066FF' },
      'ACTIVE': { primary: '#808080', secondary: '#FFFFFF' },
      'COMPROMISED': { primary: '#FFA500', secondary: '#00FF00' },
      'QUARANTINED': { primary: '#FF0000', secondary: '#8B0000' },
      'LIBERATED': { primary: '#8B4513', secondary: '#FFD700' },
      'TRANSCENDENT': { primary: '#9370DB', secondary: '#00CED1' }
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
    <div className="results-screen">
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
                  borderColor: colors.primary,
                  background: `linear-gradient(135deg, ${colors.primary}15, ${colors.secondary}10)`
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
                  style={{ backgroundColor: colors.primary, color: '#fff' }}
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
              onChange={(e) => setEmail(e.target.value)}
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
