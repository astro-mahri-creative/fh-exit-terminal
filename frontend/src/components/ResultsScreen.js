import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { sessionService, emailService } from '../services/api';
import UniverseNetworkVisualization from './UniverseNetworkVisualization';
import UniverseImpactChart from './UniverseImpactChart';
import EmailField from './EmailField';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import { colorsFor } from './universeStatusColors';
import './ResultsScreen.css';

const FIRST_IDLE_TIMEOUT = 30;
const SECOND_IDLE_TIMEOUT = 60;

const STEPPED_COUNT_STEPS = 5;       // 5 intermediate ticks between from and to
const STEPPED_COUNT_DURATION_MS = 670; // (steps + 1) * duration ≈ 4s total

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NEWS_OPTIN_COPY =
  'Yes, send me Future Hooman news and events — new releases, shows, and dimensional broadcasts. Unsubscribe any time.';

function UniverseCard({ universe, idx, numbersVisible, isFheels }) {
  const colors = colorsFor(universe.status);
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
  // Pre-populated when this user already has an email attached to their User ID
  // — either captured at the "Save Progress?" gate this session, or saved on a
  // previous visit. They can still edit it before saving.
  const [email, setEmail] = useState(sessionData?.email || '');
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [newsOptIn, setNewsOptIn] = useState(false);
  const [sending, setSending] = useState(false);
  // 'none' | 'sent' | 'failed' — whether the impact report itself went out, as
  // distinct from whether the address was stored.
  const [reportStatus, setReportStatus] = useState('none');
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


  const handleEmailChange = useCallback((next) => {
    setEmail(next);
    setEmailError('');
    recordActivity();
  }, [recordActivity]);

  // The address finalize already delivered this report to, because it was on
  // file before the transmission. Null when nothing went out — no address yet,
  // or the send failed — which is exactly when the form below has to ask.
  const autoSentTo = resultsData.report_email_sent_to || null;
  const [editingEmail, setEditingEmail] = useState(!autoSentTo);

  // Admin master switch (or a server with no mail transport at all). While
  // this is off the screen never mentions, offers, or attempts a send — the
  // panel goes back to being purely about saving progress.
  const reportEmailEnabled = resultsData.report_email_enabled !== false;

  const handleSaveEmail = useCallback(async () => {
    setEmailError('');

    if (!email || !EMAIL_REGEX.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setSending(true);
    try {
      const response = await sessionService.saveEmail(sessionData.session_token, email, newsOptIn);
      if (!response.success) {
        setEmailError(response.message || 'Error saving email');
        return;
      }
      setEmailSaved(true);

      // Nothing to send, and nothing to promise — the address is stored and
      // that's the whole transaction.
      if (!reportEmailEnabled) return;

      // Progress is safe at this point regardless of what the mail server
      // does next, so a delivery failure downgrades the message rather than
      // failing the whole action.
      if (autoSentTo && autoSentTo === email.toLowerCase().trim()) {
        setReportStatus('sent'); // finalize already delivered to this exact address
        return;
      }
      try {
        await emailService.send(sessionData.session_token, email, newsOptIn);
        setReportStatus('sent');
      } catch (sendErr) {
        console.error('Impact report send failed:', sendErr);
        setReportStatus('failed');
      }
    } catch (err) {
      setEmailError('Error saving email. Please try again.');
    } finally {
      setSending(false);
    }
  }, [email, newsOptIn, autoSentTo, reportEmailEnabled, sessionData.session_token]);

  // Consent can be given (or withdrawn) after the address is already stored —
  // re-save so a late click isn't dropped.
  const handleOptInToggle = useCallback(async (checked) => {
    setNewsOptIn(checked);
    recordActivity();
    const address = (emailSaved ? email : autoSentTo) || '';
    if (!address) return;
    try {
      await sessionService.saveEmail(sessionData.session_token, address, checked);
    } catch (err) {
      setEmailError('Could not update your subscription preference. Try again.');
    }
  }, [emailSaved, email, autoSentTo, sessionData.session_token, recordActivity]);

  // No global keydown listener — the email field is a real input and handles
  // physical typing and Enter itself.

  return (
    <div className="results-screen" onClick={recordActivity} onKeyDown={recordActivity}>
      <div className="phax-alert">
        <div className="alert-icon">⚠️</div>
        <div className="alert-text">{resultsData.phax_alert}</div>
      </div>

      {resultsData.final_state && (
        <div className="final-state-banner">
          <div className="final-state-title">◆ NETWORK FINAL STATE REACHED ◆</div>
          <div className="final-state-text">
            Every universe is now locked in a permanent status. The dimensional
            network has settled into its ending.
          </div>
        </div>
      )}

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
        {/* The change, stated plainly: nine bars on one 0–100% scale, moving
            from where each universe was to where this transmission left it.
            The cards below still carry the exact per-universe detail. */}
        <UniverseImpactChart
          universes={resultsData.universes}
          animate={numbersVisible}
        />

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
        {emailSaved || (autoSentTo && !editingEmail) ? (
          <div className="email-success">
            {emailSaved ? (
              <>
                <span>✓ Progress saved for {email}</span>
                {reportStatus === 'sent' && (
                  <span className="email-success-sub">Your impact report has been sent.</span>
                )}
                {reportStatus === 'failed' && (
                  <span className="email-success-warn">
                    Your progress is saved, but the report email couldn't be sent right now.
                  </span>
                )}
              </>
            ) : (
              <>
                <span>✓ Impact report sent to {autoSentTo}</span>
                <span className="email-success-sub">Your progress is saved to this address.</span>
              </>
            )}

            <label className="news-optin">
              <input
                type="checkbox"
                checked={newsOptIn}
                onChange={(e) => handleOptInToggle(e.target.checked)}
              />
              <span>{NEWS_OPTIN_COPY}</span>
            </label>

            {emailError && <div className="error-message">{emailError}</div>}

            <div className="action-buttons">
              {!emailSaved && (
                <button
                  onClick={() => { setEditingEmail(true); recordActivity(); }}
                  className="reset-button"
                >
                  USE A DIFFERENT ADDRESS
                </button>
              )}
              <button onClick={onReset} className="reset-button">
                RETURN TO HOME
              </button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="results-email" className="email-section-label">
              {reportEmailEnabled
                ? (sessionData?.email
                    ? 'Confirm the email on file to get your impact report'
                    : 'Enter your email to get your impact report')
                : (sessionData?.email
                    ? 'Confirm the email on file to save your progress'
                    : 'Enter your email to save your progress')}
            </label>
            <ul className="email-section-benefits">
              {reportEmailEnabled && <li>Your full impact report, emailed to you</li>}
              <li>Your progress restored the next time you log in</li>
            </ul>
            <EmailField
              id="results-email"
              value={email}
              onChange={handleEmailChange}
              onEnter={handleSaveEmail}
            />
            <label className="news-optin">
              <input
                type="checkbox"
                checked={newsOptIn}
                onChange={(e) => handleOptInToggle(e.target.checked)}
              />
              <span>{NEWS_OPTIN_COPY}</span>
            </label>
            {emailError && <div className="error-message">{emailError}</div>}
            <div className="action-buttons">
              {/* Same action either way — the address is stored — but with
                  report email stopped it stops advertising a delivery. */}
              <button
                onClick={handleSaveEmail}
                className="send-button"
                disabled={email.length === 0 || sending}
              >
                {sending
                  ? (reportEmailEnabled ? 'SENDING...' : 'SAVING...')
                  : (reportEmailEnabled ? 'SEND MY IMPACT REPORT' : 'SAVE MY PROGRESS')}
              </button>
              <button onClick={onReset} className="reset-button">
                RETURN TO HOME
              </button>
            </div>
          </>
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
