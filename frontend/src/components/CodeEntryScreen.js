import React, { useState, useCallback, useRef } from 'react';
import { codeService, sessionService } from '../services/api';
import AdminPanel from './AdminPanel';
import SegmentedInput from './SegmentedInput';
import OnScreenKeyboard from './OnScreenKeyboard';
import EmailField from './EmailField';
import { isKiosk } from '../kiosk';
import './CodeEntryScreen.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Codes are four uppercase alphanumerics.
const normalizeCode = (raw) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

const PHAX_MESSAGES = [
  'Plz don\'t make it weird.',
  'Not today (and probably not tomorrow).',
  'PHAX says hi 👋',
  'Access DENIED. jkjk',
  'You wish it was that easy 😏',
  'Ha! Good one.',
  'Don\'t worry, you\'re not the only one who tried it.',
  'That\'s classified 🤫',
  'Absolutely not lol',
  'Caught you 👀',
];

function CodeEntryScreen({ sessionData, onPreview, onLogout, onEmailCaptured }) {
  const [currentCode, setCurrentCode] = useState('');
  // Seed from the resumed session so a refresh or back-button restores the
  // list of codes already activated this round. Empty on a fresh (non-resumed)
  // login, since the backend only returns active_codes when resuming.
  const [activatedCodes, setActivatedCodes] = useState(
    () => (sessionData.active_codes || []).map(c => ({ code: c.code, tier: c.tier }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showActivation, setShowActivation] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [showTransmitConfirm, setShowTransmitConfirm] = useState(false);
  const [phaxMessage, setPhaxMessage] = useState('');

  // ── Save Progress gate ──
  // Required for any visitor who has no email on file. They must answer YES or
  // NO before codes can be transmitted; answering YES additionally requires a
  // confirmed, valid email. Admins and returning users with a saved email skip
  // the whole block.
  //
  // Frozen at mount on purpose. Confirming an email sets sessionData.email,
  // which would otherwise flip this to false and unmount the gate mid-flow —
  // the section would vanish out from under the user instead of showing them
  // the "progress will be saved" confirmation they just earned.
  const [needsSaveProgress] = useState(
    () => !sessionData.is_admin && !sessionData.email
  );
  const [saveChoice, setSaveChoice] = useState(null); // null | 'yes' | 'no'
  const [email, setEmail] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [saveGateError, setSaveGateError] = useState('');
  const [gateFlash, setGateFlash] = useState(false);
  const saveGateRef = useRef(null);
  const codeRef = useRef(null);

  const isAdmin = sessionData.is_admin;

  const handleCodeChange = useCallback((raw) => {
    setCurrentCode(normalizeCode(raw));
    setError('');
  }, []);

  const handleEmailChange = useCallback((next) => {
    setEmail(next);
    setEmailError('');
  }, []);

  const handleConfirmEmail = useCallback(async () => {
    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    try {
      const response = await sessionService.saveEmail(sessionData.session_token, email);
      if (response.success) {
        setEmailSaved(true);
        setSaveGateError('');
        // Lift it to App so the impact report can pre-populate its email field.
        if (onEmailCaptured) onEmailCaptured(email.toLowerCase());
      } else {
        setEmailError(response.message || 'Error saving email');
      }
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Error saving email. Please try again.');
    }
  }, [email, sessionData.session_token, onEmailCaptured]);

  const handleSaveChoice = (choice) => {
    setSaveChoice(choice);
    setSaveGateError('');
    setGateFlash(false);
  };

  // Pull the gate into view and flash it. Used when the user tries to transmit
  // without having resolved it — the gate sits below the fold on short screens.
  const summonSaveGate = useCallback((message) => {
    setSaveGateError(message);
    setGateFlash(true);
    saveGateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setGateFlash(false), 1600);
  }, []);

  const handleActivateCode = useCallback(async () => {
    if (currentCode.length !== 4) {
      setError('Code must be exactly 4 characters');
      return;
    }

    // Easter egg: PHAX triggers a random jokey warning instead of validation
    if (currentCode.toUpperCase() === 'PHAX') {
      setPhaxMessage(PHAX_MESSAGES[Math.floor(Math.random() * PHAX_MESSAGES.length)]);
      setCurrentCode('');
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await codeService.validate(sessionData.session_token, currentCode);

      if (response.success && response.valid) {
        setShowActivation(true);
        setTimeout(() => setShowActivation(false), 1800);

        setActivatedCodes(prev => [...prev, {
          code: response.code,
          name: response.code_name,
          tier: response.code_tier
        }]);

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
  }, [currentCode, sessionData.session_token]);

  // No global keydown listener: each field is a real input, so a physical
  // keystroke lands in whichever one the user focused, and Enter is handled by
  // that input's own onEnter.

  // Guards the TRANSMIT button: the Save Progress question is not optional.
  const handleTransmitClick = () => {
    if (needsSaveProgress) {
      if (saveChoice === null) {
        summonSaveGate('Choose YES or NO to save your progress before transmitting.');
        return;
      }
      if (saveChoice === 'yes' && !emailSaved) {
        summonSaveGate('Confirm your email address, or choose NO, before transmitting.');
        return;
      }
    }
    setShowTransmitConfirm(true);
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
            <div className="code-display-row">
              <div className="code-input-box">
                <SegmentedInput
                  length={4}
                  value={currentCode}
                  onChange={handleCodeChange}
                  onEnter={handleActivateCode}
                  inputRef={codeRef}
                  cellClassName="code-char"
                  disabled={loading}
                  autoFocus={isKiosk()}
                  ariaLabel="Activation code"
                />
              </div>
              <button
                onClick={handleActivateCode}
                className="activate-button"
                disabled={loading || currentCode.length !== 4}
              >
                {loading ? 'PROCESSING...' : 'ACTIVATE CODE'}
              </button>
            </div>
          </div>

          <OnScreenKeyboard
            inputRef={codeRef}
            value={currentCode}
            maxLength={4}
            disabled={loading}
          />

          {error && <div className="error-message">{error}</div>}
        </div>

        <button
          onClick={handleTransmitClick}
          className="proceed-button"
          disabled={loading || activatedCodes.length === 0}
        >
          {loading ? 'PROCESSING...' : 'TRANSMIT CODES'}
        </button>

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

        {needsSaveProgress && (
          <div
            ref={saveGateRef}
            className={`save-progress-section${gateFlash ? ' flash' : ''}${saveChoice === null ? ' unanswered' : ''}`}
          >
            <div className="save-progress-question">
              <span className="save-progress-label">
                SAVE PROGRESS? <span className="save-progress-required">REQUIRED</span>
              </span>
              <div className="save-progress-options">
                <button
                  className={`save-progress-btn yes${saveChoice === 'yes' ? ' selected' : ''}`}
                  onClick={() => handleSaveChoice('yes')}
                >
                  YES
                </button>
                <button
                  className={`save-progress-btn no${saveChoice === 'no' ? ' selected' : ''}`}
                  onClick={() => handleSaveChoice('no')}
                >
                  NO
                </button>
              </div>
            </div>

            {saveChoice === 'yes' && !emailSaved && (
              <div className="save-progress-email">
                <label htmlFor="save-progress-email" className="save-progress-email-label">
                  Enter your email to attach it to User ID <strong>{sessionData.user_id}</strong>
                </label>
                <EmailField
                  id="save-progress-email"
                  value={email}
                  onChange={handleEmailChange}
                  onEnter={handleConfirmEmail}
                  autoFocus
                  trailing={(
                    <button
                      className="email-confirm-button"
                      onClick={handleConfirmEmail}
                      disabled={email.length === 0}
                    >
                      CONFIRM
                    </button>
                  )}
                />
                {emailError && <div className="error-message">{emailError}</div>}
              </div>
            )}

            {saveChoice === 'yes' && emailSaved && (
              <div className="save-progress-confirmed">
                ✓ Progress will be saved to {email}
              </div>
            )}

            {saveChoice === 'no' && (
              <div className="save-progress-declined">
                Progress will not be saved. Your results will be shown once, then discarded.
              </div>
            )}

            {saveGateError && <div className="error-message">{saveGateError}</div>}
          </div>
        )}
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

      {phaxMessage && (
        <div className="phax-warning-overlay" onClick={() => setPhaxMessage('')}>
          <div className="phax-warning-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="phax-warning-text">{phaxMessage}</p>
            <button
              className="phax-warning-dismiss"
              onClick={() => setPhaxMessage('')}
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodeEntryScreen;
