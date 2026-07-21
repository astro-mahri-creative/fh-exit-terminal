import React, { useState, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { sessionService } from '../services/api';
import SegmentedInput from './SegmentedInput';
import OnScreenKeyboard from './OnScreenKeyboard';
import { isKiosk } from '../kiosk';
import './WelcomeScreen.css';

// The mobile terminal is this same app on the visitor's own phone. Built from
// the live origin rather than hardcoded so the code cannot go stale if the
// domain moves, and pinned to `?kiosk=0` because the kiosk flag is persisted
// per-device: without it a phone that ever loaded a kiosk URL would come back
// in kiosk mode and get the on-screen keyboard it cannot use.
const mobileLoginUrl = () => `${window.location.origin}/?kiosk=0`;

// Six lowercase alphanumerics. Applied on every change so it holds no matter
// how the characters arrive — on-screen keys, a physical keyboard, or a paste.
const normalizeUserId = (raw) =>
  raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

function WelcomeScreen({ onSessionStart, onViewNetwork }) {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userIdRef = useRef(null);
  // Terminal lockout, set by the admin panel. Non-admins get turned away here.
  const [lockoutMessage, setLockoutMessage] = useState('');
  // Freshly minted ID awaiting the user's two confirmations. `newIdStep` is 1
  // while they're reading it and 2 on the "are you sure you wrote it down"
  // challenge — they cannot reach the terminal without clearing both.
  const [newId, setNewId] = useState('');
  const [newIdStep, setNewIdStep] = useState(0);
  const [creatingId, setCreatingId] = useState(false);
  // Kiosk-only: hands the visitor the mobile terminal via QR so they can carry
  // the session out of the exhibit on their own phone.
  const [showMobileQr, setShowMobileQr] = useState(false);

  // A locked terminal and a bad ID are different failures: the lockout is a
  // full-screen popup, everything else is the inline error line.
  const reportFailure = useCallback((err, fallback) => {
    const data = err.response?.data;
    if (data?.error === 'TERMINAL_LOCKED') {
      setLockoutMessage(data.message);
      return;
    }
    setError(data?.message || fallback);
  }, []);

  const startSession = useCallback(async (id) => {
    setLoading(true);
    setError('');
    try {
      const response = await sessionService.start(id);
      if (response.success) {
        onSessionStart(response);
      } else {
        setError(response.message || 'Failed to start session');
      }
    } catch (err) {
      reportFailure(err, 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onSessionStart, reportFailure]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (userId.length !== 6) {
      setError('User ID must be exactly 6 characters');
      return;
    }
    await startSession(userId);
  }, [userId, startSession]);

  const handleCreateNewId = useCallback(async () => {
    setError('');
    setCreatingId(true);
    try {
      const response = await sessionService.createUserId();
      if (response.success) {
        setNewId(response.user_id);
        setNewIdStep(1);
      } else {
        setError(response.message || 'Could not create a User ID');
      }
    } catch (err) {
      reportFailure(err, 'Could not create a User ID. Please try again.');
    } finally {
      setCreatingId(false);
    }
  }, [reportFailure]);

  const handleConfirmNewId = useCallback(() => {
    setNewIdStep(0);
    const id = newId;
    setNewId('');
    startSession(id);
  }, [newId, startSession]);

  const handleUserIdChange = useCallback((raw) => {
    setUserId(normalizeUserId(raw));
    setError('');
  }, []);

  return (
    <div className="welcome-screen">
      <div className="welcome-container">
        {isKiosk() && (
          <button
            className="mobile-login-btn"
            onClick={() => setShowMobileQr(true)}
            aria-haspopup="dialog"
          >
            MOBILE<br/>LOGIN
          </button>
        )}

        <div className="logo-container">
          {/* FUTURE HOOMAN is the parent brand — a kicker above the terminal's
              own name, which is what this screen is actually announcing. */}
          <div className="project-title">FUTURE HOOMAN</div>
          <h1 className="terminal-title">EXIT TERMINAL</h1>
        </div>

        <p className="instructions">
          Login with your User ID to access the<br/>
          <span className="terminal-name">EXPERIMENTAL iFLU TRACKING TERMINAL</span>
        </p>

        <div className="new-user-cta">
          <button
            className="create-id-button"
            onClick={handleCreateNewId}
            disabled={loading || creatingId}
          >
            {creatingId ? 'GENERATING...' : '+ CREATE NEW USER ID'}
          </button>
          <p className="new-user-hint">First time here? Generate an ID to begin.</p>
        </div>

        <div className="welcome-divider"><span>OR ENTER AN EXISTING ID</span></div>

        <div className="user-id-form">
          <div className="input-group">
            <label htmlFor="user-id-input">User ID:</label>
            <div className="user-id-display">
              <SegmentedInput
                id="user-id-input"
                length={6}
                value={userId}
                onChange={handleUserIdChange}
                onEnter={handleSubmit}
                inputRef={userIdRef}
                cellClassName="user-id-char"
                disabled={loading}
                autoFocus={isKiosk()}
                ariaLabel="User ID"
              />
            </div>
          </div>

          <OnScreenKeyboard
            inputRef={userIdRef}
            value={userId}
            maxLength={6}
            disabled={loading}
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

      {newIdStep > 0 && (
        <div className="new-id-overlay">
          <div className="new-id-dialog">
            {newIdStep === 1 ? (
              <>
                <div className="new-id-title">YOUR USER ID HAS BEEN ISSUED</div>
                <p className="new-id-text">
                  Write this down. It is the only way back into your session.
                </p>
                <div className="new-id-value">{newId}</div>
                <p className="new-id-warning">
                  PHAX does not recover lost IDs.
                </p>
                <div className="new-id-actions">
                  <button
                    className="new-id-confirm"
                    onClick={() => setNewIdStep(2)}
                  >
                    I HAVE RECORDED MY ID
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="new-id-title">CONFIRM</div>
                <p className="new-id-text">
                  Say it back: is your User ID written down somewhere safe?
                </p>
                <div className="new-id-value small">{newId}</div>
                <div className="new-id-actions two-up">
                  <button
                    className="new-id-back"
                    onClick={() => setNewIdStep(1)}
                  >
                    SHOW IT AGAIN
                  </button>
                  <button
                    className="new-id-confirm"
                    onClick={handleConfirmNewId}
                    disabled={loading}
                  >
                    {loading ? 'CONNECTING...' : 'YES — CONTINUE'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showMobileQr && (
        <div
          className="mobile-qr-overlay"
          onClick={() => setShowMobileQr(false)}
        >
          {/* The dialog swallows the click so only the backdrop dismisses. */}
          <div
            className="mobile-qr-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile login"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-qr-title">CONTINUE ON YOUR PHONE</div>
            <p className="mobile-qr-text">
              Scan to open the EXIT TERMINAL on your own device.
            </p>
            {/* White quiet zone is not decoration — scanners need the contrast
                and the margin, and this screen is otherwise near-black. */}
            <div className="mobile-qr-code">
              <QRCodeSVG
                value={mobileLoginUrl()}
                size={420}
                level="M"
                marginSize={2}
                style={{ width: '100%', height: 'auto' }}
              />
            </div>
            <button
              className="mobile-qr-dismiss"
              onClick={() => setShowMobileQr(false)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {lockoutMessage && (
        <div className="lockout-overlay">
          <div className="lockout-dialog">
            <div className="lockout-icon">⚠</div>
            <p className="lockout-text">{lockoutMessage}</p>
            <button
              className="lockout-dismiss"
              onClick={() => setLockoutMessage('')}
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WelcomeScreen;
