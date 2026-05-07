import React, { useState, useEffect, useRef, useCallback } from 'react';
import { emailService } from '../services/api';
import UniverseNetworkVisualization from './UniverseNetworkVisualization';
import TerminalKeyboard from './TerminalKeyboard';
import './ResultsScreen.css';

const FIRST_IDLE_TIMEOUT = 30;
const SECOND_IDLE_TIMEOUT = 60;

// Animate a number from `from` to `to` once `enabled` flips true.
// Returns the current rounded integer; stays at `to` when disabled.
function useCountUp(from, to, duration, enabled, delayMs = 0) {
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!enabled || from === to) {
      setValue(to);
      return;
    }
    setValue(from);
    let raf;
    let startTime;
    const tick = (now) => {
      if (startTime == null) startTime = now;
      const elapsed = now - startTime - delayMs;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration, enabled, delayMs]);
  return value;
}

const STATUS_COLORS = {
  OPTIMIZED:    { primary: '#b0bec5', secondary: '#78909c', textColor: '#0a0a0a' },
  ACTIVE:       { primary: '#9e9e9e', secondary: '#616161', textColor: '#0a0a0a' },
  COMPROMISED:  { primary: '#e6911a', secondary: '#a05c08', textColor: '#0a0a0a' },
  QUARANTINED:  { primary: '#c94040', secondary: '#7c1a1a', textColor: '#f0eeeb' },
  LIBERATED:    { primary: '#a0784a', secondary: '#5c3d20', textColor: '#f0eeeb' },
  TRANSCENDENT: { primary: '#9575cd', secondary: '#4527a0', textColor: '#f0eeeb' },
};

function UniverseCard({ universe, idx, numbersVisible, isFheels }) {
  const colors = STATUS_COLORS[universe.status] || STATUS_COLORS.ACTIVE;
  const startVal = universe.current_cases - universe.change;
  const animatedCases = useCountUp(startVal, universe.current_cases, 900, numbersVisible, idx * 40);
  const numClass = numbersVisible
    ? (isFheels ? 'numbers-fheels-reveal' : 'numbers-animate')
    : 'numbers-hidden';
  const cardDelay = `${idx * 40}ms`;

  return (
    <div
      className="universe-card"
      style={{
        borderColor: colors.primary + '66',
        background: `linear-gradient(160deg, ${colors.primary}12, ${colors.secondary}08)`
      }}
    >
      <div className="universe-name">{universe.name}</div>
      <div className="universe-cases">
        <div className="cases-label">iFLU Cases:</div>
        <div className={`cases-value ${numClass}`} style={{ animationDelay: cardDelay }}>
          {animatedCases.toLocaleString()}
        </div>
        {universe.change !== 0 && (
          <div
            className={`cases-change ${universe.change > 0 ? 'increase' : 'decrease'} ${numClass}`}
            style={{ animationDelay: cardDelay }}
          >
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
}

function ResultsScreen({ resultsData, sessionData, onReset }) {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [showNetwork, setShowNetwork] = useState(false);
  const [multiverseReady, setMultiverseReady] = useState(false);
  const [numbersVisible, setNumbersVisible]   = useState(false);
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
    // Reset back to first idle phase on any user activity
    if (idleThreshold !== FIRST_IDLE_TIMEOUT) {
      setIdleThreshold(FIRST_IDLE_TIMEOUT);
    }
  }, [idleThreshold]);

  useEffect(() => {
    startIdleTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startIdleTimer]);

  // Fallback: show numbers after 8s even if 3D view never fires onReady
  useEffect(() => {
    const fallback = setTimeout(() => setNumbersVisible(true), 8000);
    return () => clearTimeout(fallback);
  }, []);

  // Show numbers 4s after multiverse overview first renders
  useEffect(() => {
    if (!multiverseReady) return;
    const timer = setTimeout(() => setNumbersVisible(true), 4000);
    return () => clearTimeout(timer);
  }, [multiverseReady]);


  const handleEmailKeyPress = useCallback((key) => {
    setEmail(prev => {
      if (prev.length < 127) {
        setEmailError('');
        return prev + key.toLowerCase();
      }
      return prev;
    });
    recordActivity();
  }, [recordActivity]);

  const handleEmailBackspace = useCallback(() => {
    setEmail(prev => prev.slice(0, -1));
    setEmailError('');
    recordActivity();
  }, [recordActivity]);

  const handleEmailClear = useCallback(() => {
    setEmail('');
    setEmailError('');
    recordActivity();
  }, [recordActivity]);

  // Physical keyboard support for email input
  useEffect(() => {
    const handlePhysicalKey = (e) => {
      if (emailSent) return;
      const key = e.key;
      if (/^[a-zA-Z0-9@._\-+]$/.test(key)) {
        handleEmailKeyPress(key.toUpperCase());
      } else if (e.key === 'Backspace') {
        handleEmailBackspace();
      } else if (e.key === 'Delete') {
        handleEmailClear();
      }
    };
    window.addEventListener('keydown', handlePhysicalKey);
    return () => window.removeEventListener('keydown', handlePhysicalKey);
  }, [emailSent, handleEmailKeyPress, handleEmailBackspace, handleEmailClear]);

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

      <div className="results-overview-viz">
        <UniverseNetworkVisualization
          mode="display"
          autoRotate={true}
          cameraZ={42}
          onReady={() => setMultiverseReady(true)}
        />
      </div>

      <div className="universe-map">
        <div className="universe-map-header">
          <h2>DIMENSIONAL XDIM TOPOLOGY</h2>
          <button
            className="network-toggle-btn"
            onClick={() => { setShowNetwork(v => !v); recordActivity(); }}
          >
            {showNetwork ? '[ GRID VIEW ]' : '[ XDIM TOPOLOGY VIEW ]'}
          </button>
        </div>

        {showNetwork ? (
          <UniverseNetworkVisualization mode="interactive" autoRotate={true} />
        ) : (
          <div className="universes-grid">
            {resultsData.universes.map((universe, idx) => (
              <UniverseCard
                key={universe.id}
                universe={universe}
                idx={idx}
                numbersVisible={numbersVisible}
                isFheels={resultsData.alignment_score > 0}
              />
            ))}
        </div>
        )}

        {resultsData.cure_active && (
          <div className="cure-indicator">
            🧬 CURE PROTOCOL ACTIVE — iFLU cure discovered
          </div>
        )}
      </div>

      <div className="impact-summary">
        <h3>YOUR IMPACT</h3>

        {(() => {
          const isFheels = resultsData.alignment_score > 0;
          const numClass = numbersVisible
            ? (isFheels ? 'numbers-fheels-reveal' : 'numbers-animate')
            : 'numbers-hidden';
          return (
            <>
              {/* Prominent code count — top of impact report */}
              <div className={`codes-activated-banner ${numClass}`}>
                <div className="codes-count-display">
                  <span className="codes-entered-num">{resultsData.total_codes_entered}</span>
                  <span className="codes-count-sep"> of </span>
                  <span className="codes-total-num">{resultsData.total_codes ?? '—'}</span>
                </div>
                <div className="codes-activated-label">CODES ACTIVATED</div>
              </div>

              <p className={`alignment-narrative ${numClass}`} style={{ animationDelay: '100ms' }}>
                {resultsData.alignment_narrative}
              </p>
              <div className={`stats ${numClass}`} style={{ animationDelay: '200ms' }}>
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
            </>
          );
        })()}
      </div>

      <div className="email-section">
        {!emailSent ? (
          <>
            <div className="email-display">
              <span className="email-display-text">
                {email || <span className="email-placeholder">enter email address</span>}
              </span>
              <span className="email-cursor">|</span>
            </div>
            <TerminalKeyboard
              onKeyPress={handleEmailKeyPress}
              onBackspace={handleEmailBackspace}
              onClear={handleEmailClear}
              keysDisabled={email.length >= 127}
              backspaceDisabled={email.length === 0}
              showNumbers
              extraBottomKeys={{ left: '@', right: '.' }}
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
        {idleThreshold === FIRST_IDLE_TIMEOUT
          ? `Idle Time is: ${FIRST_IDLE_TIMEOUT - countdown}s`
          : `Screen Resets in: ${countdown}s`}
      </div>
    </div>
  );
}

export default ResultsScreen;
