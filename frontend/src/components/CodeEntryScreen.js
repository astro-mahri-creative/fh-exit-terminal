import React, { useState, useCallback, useRef, useEffect } from 'react';
import { codeService } from '../services/api';
import AdminPanel from './AdminPanel';
import SegmentedInput from './SegmentedInput';
import OnScreenKeyboard from './OnScreenKeyboard';
import TerminalNotice from './TerminalNotice';
import {
  PHAX_MESSAGES,
  INVALID_CODE_MESSAGES,
  INVALID_CODE_HEADLINES,
  DUPLICATE_CODE_HEADLINES,
  pickMessage,
} from './terminalMessages';
import { isKiosk } from '../kiosk';
import './CodeEntryScreen.css';

// How long a freshly activated code stays highlighted in the list. Outlasts
// the 1800ms activation overlay by enough that the user still sees the glow
// land on the list once the overlay clears — that's the whole point of it.
const HIGHLIGHT_MS = 4200;

// Idle time, with at least one code banked, before the screen starts actively
// nagging about transmitting. Visitors were walking away from the terminal
// with codes activated but never sent.
const TRANSMIT_NUDGE_MS = 15000;

// Codes are four uppercase alphanumerics.
const normalizeCode = (raw) =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

function CodeEntryScreen({ sessionData, onPreview, onLogout }) {
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

  // The one modal channel for both interruptions — a rejected code and the
  // PHAX easter egg. `null` when nothing is being shown.
  const [notice, setNotice] = useState(null);
  const lastPhaxRef = useRef(null);
  const lastInvalidRef = useRef(null);

  // Which code just landed, so the list can flash it. Held as a token
  // (code + counter) rather than a bare string so re-entering the same code
  // after an admin duplicate override still retriggers the animation.
  const [highlight, setHighlight] = useState(null);
  const highlightSeq = useRef(0);
  const codesSectionRef = useRef(null);

  // Escalating transmit reminder — see TRANSMIT_NUDGE_MS.
  const [nudge, setNudge] = useState(false);

  const codeRef = useRef(null);

  const isAdmin = sessionData.is_admin;
  const hasCodes = activatedCodes.length > 0;

  const handleCodeChange = useCallback((raw) => {
    setCurrentCode(normalizeCode(raw));
    setError('');
  }, []);

  const showInvalidCodeNotice = useCallback((reason, errorCode) => {
    const message = pickMessage(INVALID_CODE_MESSAGES, lastInvalidRef.current);
    lastInvalidRef.current = message;
    const isDuplicate =
      errorCode === 'CODE_ALREADY_ENTERED' || errorCode === 'CODE_PREVIOUSLY_ENTERED';
    setNotice({
      tone: 'error',
      headline: pickMessage(isDuplicate ? DUPLICATE_CODE_HEADLINES : INVALID_CODE_HEADLINES),
      message,
      detail: reason,
      dismissLabel: 'TRY ANOTHER CODE',
    });
  }, []);

  const handleActivateCode = useCallback(async () => {
    if (currentCode.length !== 4) {
      setError('Code must be exactly 4 characters');
      return;
    }

    // Easter egg: PHAX triggers a random jokey warning instead of validation
    if (currentCode.toUpperCase() === 'PHAX') {
      const message = pickMessage(PHAX_MESSAGES, lastPhaxRef.current);
      lastPhaxRef.current = message;
      setNotice({ tone: 'phax', message, dismissLabel: 'DISMISS' });
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

        highlightSeq.current += 1;
        setHighlight({ code: response.code, seq: highlightSeq.current });
        setCurrentCode('');
      } else {
        showInvalidCodeNotice(response.message || 'Code not recognized', response.error);
      }
    } catch (err) {
      // Every rejection the server can hand back — unrecognized, already used
      // this session, used in a previous one — is a "that didn't work" moment
      // and gets the same loud treatment. The specific reason rides along as
      // the dialog's detail line.
      const status = err.response?.status;
      const reason = err.response?.data?.message;
      if (status === 400 && reason) {
        showInvalidCodeNotice(reason, err.response?.data?.error);
      } else {
        setError(reason || 'Error validating code');
      }
    } finally {
      setLoading(false);
    }
  }, [currentCode, sessionData.session_token, showInvalidCodeNotice]);

  // Clear the highlight once it has had its moment.
  useEffect(() => {
    if (!highlight) return undefined;
    const timer = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);

  // Bring the list into view when a code lands. `block: 'nearest'` is a no-op
  // when it's already on screen, so this only fires on the small viewports
  // where the list has been pushed below the fold.
  useEffect(() => {
    if (!highlight) return;
    codesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlight]);

  // Start (or restart) the transmit reminder countdown. Any activity that
  // suggests the user is still working — typing, activating, opening a dialog
  // — resets it; going quiet with codes banked brings it back.
  useEffect(() => {
    if (!hasCodes || showTransmitConfirm) {
      setNudge(false);
      return undefined;
    }
    setNudge(false);
    const timer = setTimeout(() => setNudge(true), TRANSMIT_NUDGE_MS);
    return () => clearTimeout(timer);
  }, [hasCodes, activatedCodes.length, currentCode, showTransmitConfirm, notice]);

  // No global keydown listener: each field is a real input, so a physical
  // keystroke lands in whichever one the user focused, and Enter is handled by
  // that input's own onEnter.

  // TRANSMIT opens the "activated everything?" confirmation. Email capture
  // lives on the impact report screen, after the visitor has seen what they
  // did — it is not a precondition for transmitting.
  const handleTransmitClick = () => {
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

        {/* Order matters here: keyboard → the list the code just landed in →
            TRANSMIT. The list sitting between the two buttons is what turns
            "I activated a code" into "I have N codes waiting to be sent",
            and keeps the send action within a glance of the keyboard. */}
        <div
          ref={codesSectionRef}
          className={`activated-codes-section${hasCodes ? ' has-codes' : ''}${highlight ? ' just-received' : ''}`}
        >
          <h3>ACTIVATED CODES</h3>
          <div className="codes-list">
            {activatedCodes.length === 0 ? (
              <p className="no-codes">No codes activated yet</p>
            ) : (
              activatedCodes.map((code, index) => (
                <div
                  key={index}
                  className={`activated-code-item${
                    highlight && index === activatedCodes.length - 1 ? ' just-added' : ''
                  }`}
                >
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

        {nudge && (
          <div className="transmit-nudge" role="status">
            <span className="transmit-nudge-icon">▲</span>
            <span className="transmit-nudge-text">
              {activatedCodes.length} code{activatedCodes.length !== 1 ? 's' : ''} activated but
              {' '}<strong>not yet transmitted</strong>. Your codes only count once you transmit.
            </span>
          </div>
        )}

        <button
          onClick={handleTransmitClick}
          className={`proceed-button${hasCodes ? ' ready' : ''}${nudge ? ' urgent' : ''}`}
          disabled={loading || activatedCodes.length === 0}
        >
          {loading ? 'PROCESSING...' : 'TRANSMIT CODES'}
        </button>
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

      {notice && (
        <TerminalNotice
          tone={notice.tone}
          headline={notice.headline}
          message={notice.message}
          detail={notice.detail}
          dismissLabel={notice.dismissLabel}
          onDismiss={() => {
            setNotice(null);
            setCurrentCode('');
            codeRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default CodeEntryScreen;
