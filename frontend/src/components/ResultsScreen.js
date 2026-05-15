import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sessionService } from '../services/api';
import UniverseNetworkVisualization from './UniverseNetworkVisualization';
import TerminalKeyboard from './TerminalKeyboard';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import './ResultsScreen.css';

const FIRST_IDLE_TIMEOUT = 30;
const SECOND_IDLE_TIMEOUT = 60;

const STEPPED_COUNT_STEPS = 5;       // 5 intermediate ticks between from and to
const STEPPED_COUNT_DURATION_MS = 670; // (steps + 1) * duration ≈ 4s total

const STATUS_COLORS = {
  TRANSCENDED:  { primary: '#9575cd', secondary: '#5e35b1', textColor: '#f0eeeb' },
  PRESERVED:    { primary: '#4a90d9', secondary: '#2a5a8a', textColor: '#f0eeeb' },
  COMPROMISED:  { primary: '#7ec88b', secondary: '#4a8a54', textColor: '#0a0a0a' },
  LIBERATED:    { primary: '#d4a032', secondary: '#8a6a1a', textColor: '#0a0a0a' },
  QUARANTINED:  { primary: '#c94040', secondary: '#7b1a1a', textColor: '#f0eeeb' },
};

function UniverseCard({ universe, idx, numbersVisible, isFheels }) {
  const colors = STATUS_COLORS[universe.status] || STATUS_COLORS.COMPROMISED;
  const startVal = universe.current_cases - universe.change;
  const animatedCases = useSteppedCountUp(
    startVal,
    universe.current_cases,
    STEPPED_COUNT_STEPS,
    STEPPED_COUNT_DURATION_MS,
    numbersVisible,
    idx * 40,
  );
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
        {/* Always visible: shows the original (pre-event) value in white before
            the count-up triggers. When numbersVisible flips, the directional
            class is added — CSS transition smoothly fades white → green/red,
            and that color is what persists once the count-up settles. */}
        <div
          className={`cases-value ${
            numbersVisible
              ? (universe.change > 0 ? 'cases-up' : universe.change < 0 ? 'cases-down' : '')
              : ''
          }`}
        >
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
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [multiverseReady, setMultiverseReady] = useState(false);
  const [numbersVisible, setNumbersVisible]   = useState(false);
  const [countdown, setCountdown] = useState(FIRST_IDLE_TIMEOUT);
  const [idleThreshold, setIdleThreshold] = useState(FIRST_IDLE_TIMEOUT);
  const intervalRef = useRef(null);
  const countdownRef = useRef(FIRST_IDLE_TIMEOUT);
  const lastActivityRef = useRef(Date.now());

  const isAdmin = sessionData?.is_admin;

  const startIdleTimer = useCallback(() => {
    if (isAdmin) return;
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
  }, [isAdmin, idleThreshold, onReset]);

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

  // Pause auto-rotation for 10s after the topology view loads so the user
  // can watch the count-up animation on the focused universe before the
  // camera starts orbiting.
  const [autoRotateOn, setAutoRotateOn] = useState(false);
  useEffect(() => {
    if (!multiverseReady) return;
    const timer = setTimeout(() => setAutoRotateOn(true), 10000);
    return () => clearTimeout(timer);
  }, [multiverseReady]);

  // Map of universe._id (string) -> case change. Lets the 3D label component
  // animate from previous-cases (current - change) to current-cases.
  const caseDeltas = useMemo(() => {
    const out = {};
    resultsData.universes.forEach((u) => {
      out[u.id?.toString?.() ?? u._id?.toString?.() ?? u.id] = u.change ?? 0;
    });
    return out;
  }, [resultsData.universes]);

  // Universe with the largest absolute case delta — the topology view will
  // shift its layout so this universe sits at origin, putting the most-
  // affected node front-and-center for the user to watch the count tick.
  const focusUniverseId = useMemo(() => {
    if (!resultsData?.universes?.length) return undefined;
    let pick = null;
    let maxAbs = -1;
    resultsData.universes.forEach((u) => {
      const abs = Math.abs(u.change ?? 0);
      if (abs > maxAbs) {
        maxAbs = abs;
        pick = u.id?.toString?.() ?? u._id?.toString?.() ?? u.id;
      }
    });
    return pick ?? undefined;
  }, [resultsData.universes]);


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

  const handleSaveEmail = useCallback(async () => {
    setEmailError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      const response = await sessionService.saveEmail(sessionData.session_token, email);
      if (response.success) {
        setEmailSaved(true);
      } else {
        setEmailError(response.message || 'Error saving email');
      }
    } catch (err) {
      setEmailError('Error saving email. Please try again.');
    }
  }, [email, sessionData.session_token]);

  // Physical keyboard support for email input
  useEffect(() => {
    const handlePhysicalKey = (e) => {
      if (emailSaved) return;
      const key = e.key;
      if (/^[a-zA-Z0-9@._\-+]$/.test(key)) {
        handleEmailKeyPress(key.toUpperCase());
      } else if (key === 'Backspace') {
        handleEmailBackspace();
      } else if (key === 'Delete') {
        handleEmailClear();
      } else if (key === 'Enter' && email.length > 0) {
        handleSaveEmail();
      }
    };
    window.addEventListener('keydown', handlePhysicalKey);
    return () => window.removeEventListener('keydown', handlePhysicalKey);
  }, [emailSaved, email, handleEmailKeyPress, handleEmailBackspace, handleEmailClear, handleSaveEmail]);

  return (
    <div className="results-screen" onClick={recordActivity} onKeyDown={recordActivity}>
      <div className="phax-alert">
        <div className="alert-icon">⚠️</div>
        <div className="alert-text">{resultsData.phax_alert}</div>
      </div>

      <div className="results-overview-viz">
        {/* Mirrors the original/primary topology view (interactive mode,
            same camera / orbit behavior). The only impact-report-specific
            tweak is targeting the most-affected universe and pausing
            auto-rotate for 10s so the count-up animation is easy to watch. */}
        <UniverseNetworkVisualization
          mode="interactive"
          autoRotate={autoRotateOn}
          cameraZ={15}
          caseDeltas={caseDeltas}
          animateNumbers={numbersVisible}
          focusUniverseId={focusUniverseId}
          onReady={() => setMultiverseReady(true)}
        />
      </div>

      <div className="universe-map">
        <div className="universes-grid">
          {[...resultsData.universes].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).map((universe, idx) => (
            <UniverseCard
              key={universe.id}
              universe={universe}
              idx={idx}
              numbersVisible={numbersVisible}
              isFheels={resultsData.alignment_score > 0}
            />
          ))}
        </div>

        {resultsData.cure_active && (
          <div className="cure-indicator">
            🧬 CURE PROTOCOL ACTIVE — iFLU cure discovered
          </div>
        )}

        {resultsData.status_messages && resultsData.status_messages.length > 0 && (
          <div className="status-messages">
            {resultsData.status_messages.map((msg, i) => (
              <div key={i} className={`status-message ${msg.message === 'NO IMPACT' ? 'no-impact' : 'status-change'}`}>
                <span className="status-msg-code">[{msg.code}]</span>
                <span className="status-msg-text">{msg.message}</span>
              </div>
            ))}
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
        {!emailSaved ? (
          <>
            <p className="email-section-label">Enter your email to save your progress</p>
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
              <button onClick={handleSaveEmail} className="send-button" disabled={email.length === 0}>
                SAVE MY PROGRESS
              </button>
              <button onClick={onReset} className="reset-button">
                RETURN TO HOME
              </button>
            </div>
          </>
        ) : (
          <div className="email-success">
            ✓ Progress saved for {email}
            <button onClick={onReset} className="reset-button">
              RETURN TO HOME
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="countdown">
          {idleThreshold === FIRST_IDLE_TIMEOUT
            ? `Idle Time is: ${FIRST_IDLE_TIMEOUT - countdown}s`
            : `Screen Resets in: ${countdown}s`}
        </div>
      )}
    </div>
  );
}

export default ResultsScreen;
