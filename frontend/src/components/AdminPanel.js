import React, { useState, useEffect, useCallback } from 'react';
import { adminService, universeService } from '../services/api';
import './AdminPanel.css';

const TODAY = new Date().toISOString().slice(0, 10);

// Drives both the desktop tab strip and the mobile <select> — one list so the
// two renderings can never drift apart.
const TABS = [
  { id: 'actions',   label: 'ACTIONS' },
  { id: 'users',     label: 'USERS' },
  { id: 'universes', label: 'UNIVERSES' },
  { id: 'codes',     label: 'CODES & EFFECTS' },
  { id: 'analytics', label: 'ANALYTICS' },
];

function AdminPanel({ sessionData }) {
  const [activeTab, setActiveTab] = useState('actions');
  const [users, setUsers] = useState([]);
  const [codes, setCodes] = useState([]);
  const [universes, setUniverses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [expandedCode, setExpandedCode] = useState(null);
  const [userFilter, setUserFilter] = useState('all'); // 'all', 'used', 'unused'
  const [effectScale, setEffectScale] = useState(1);
  const [analytics, setAnalytics] = useState(null);
  const [userSort, setUserSort] = useState('logins'); // 'logins' | 'codes'
  const [terminalLocked, setTerminalLocked] = useState(false);
  // Automatic impact-report send at the end of a transmission, and whether the
  // server has any mail transport at all — an "ON" toggle means nothing if the
  // provider credentials are missing or dead.
  const [autoSendEmail, setAutoSendEmail] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(true);
  // Final-state watch: how many universes are locked, which alert channels are
  // configured, and what happened the last time the network ended.
  const [finalState, setFinalState] = useState(null);
  const [alertTestResult, setAlertTestResult] = useState('');
  // Which reset-to-reset window the analytics tab is reporting on: a phase
  // number as a string, or 'all'. Empty until the first response tells us
  // which phase is current.
  const [selectedPhase, setSelectedPhase] = useState('');
  // YYYY-MM-DD strings bounding the analytics window WITHIN the selected phase.
  // Start is empty until the first response comes back, at which point we
  // default it to the phase's start so the picker shows the whole phase. End
  // defaults to today. Setting both to the same date selects exactly that day.
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState(TODAY);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.getUsers(sessionData.session_token);
      if (response.success) setUsers(response.users);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionData.session_token]);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.getCodes(sessionData.session_token);
      if (response.success) setCodes(response.codes);
    } catch (err) {
      console.error('Error loading codes:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionData.session_token]);

  const loadUniverses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await universeService.getAll();
      if (response.success) setUniverses(response.universes);
    } catch (err) {
      console.error('Error loading universes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (startDate, endDate, phase) => {
    setLoading(true);
    try {
      const response = await adminService.getDetailedAnalytics(
        sessionData.session_token, startDate, endDate, phase
      );
      if (response.success) setAnalytics(response.analytics);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionData.session_token]);

  // After the first analytics response arrives, adopt the phase the backend
  // picked (the current one) and default the FROM picker to that phase's
  // start, so the admin sees the whole phase without touching anything.
  useEffect(() => {
    if (!analytics) return;
    if (!selectedPhase) {
      // A deployment with no reset ever recorded has no phases to select and
      // the backend queried the whole log — which is exactly ALL PHASES.
      const current = analytics.selected_phase;
      setSelectedPhase(current === null || current === undefined ? 'all' : String(current));
    }
    if (analytics.phase_start_date && !analyticsStartDate) {
      setAnalyticsStartDate(analytics.phase_start_date.slice(0, 10));
    }
  }, [analytics, analyticsStartDate, selectedPhase]);

  // Keep the range coherent: dragging one end past the other pulls the other
  // along, so FROM is never after TO.
  const handleAnalyticsRangeChange = (which, newDate) => {
    if (!newDate) return;
    let from = which === 'from' ? newDate : analyticsStartDate;
    let to = which === 'to' ? newDate : analyticsEndDate;
    if (from && to && from > to) {
      if (which === 'from') to = from;
      else from = to;
    }
    setAnalyticsStartDate(from);
    setAnalyticsEndDate(to);
    loadAnalytics(from, to, selectedPhase);
  };

  // Switching phase snaps the date range to that phase's own bounds, so the
  // pickers never carry a window from the previous selection. Day-granular
  // bounds are deliberately loose at both ends — the backend clamps them to
  // the exact reset moments, so the phase can't bleed into its neighbours.
  const handlePhaseChange = (value) => {
    const phase = (analytics?.phases || []).find(p => String(p.phase_number) === value);
    const from = value === 'all' || !phase?.started_at ? '' : phase.started_at.slice(0, 10);
    const to = value === 'all' || !phase?.ended_at ? TODAY : phase.ended_at.slice(0, 10);
    setSelectedPhase(value);
    setAnalyticsStartDate(from);
    setAnalyticsEndDate(to);
    loadAnalytics(from, to, value);
  };

  // "PHASE 2 · 2026-07-12 → 2026-08-01", newest first.
  const phaseOptionLabel = (p) => {
    const start = p.started_at ? p.started_at.slice(0, 10) : 'START';
    const end = p.is_current ? 'NOW' : (p.ended_at ? p.ended_at.slice(0, 10) : 'NOW');
    return `${p.label}${p.is_current ? ' (CURRENT)' : ''} · ${start} → ${end}`;
  };

  // No confirm dialog on this one: unlike the terminal lock it affects nobody
  // already mid-session, and it's cheap to flip back.
  const handleToggleAutoEmail = async () => {
    try {
      const response = await adminService.toggleAutoEmail(sessionData.session_token);
      if (response.success) setAutoSendEmail(response.autoSendImpactReport);
    } catch (err) {
      alert('Error updating auto-send setting');
    }
  };

  const handleToggleTerminalLock = async () => {
    const locking = !terminalLocked;
    const warning = locking
      ? 'LOCK the terminal? Non-admin users will be blocked from logging in or creating a new User ID.'
      : 'UNLOCK the terminal? Visitors will be able to log in again.';
    if (!window.confirm(warning)) return;
    try {
      const response = await adminService.toggleTerminalLock(sessionData.session_token);
      if (response.success) setTerminalLocked(response.terminalLocked);
    } catch (err) {
      alert('Error updating terminal lock');
    }
  };

  useEffect(() => {
    adminService.getAnalytics(sessionData.session_token).then(res => {
      if (res.success) {
        if (res.analytics.effectScale !== undefined) setEffectScale(res.analytics.effectScale);
        setTerminalLocked(!!res.analytics.terminalLocked);
        if (res.analytics.autoSendImpactReport !== undefined) {
          setAutoSendEmail(!!res.analytics.autoSendImpactReport);
        }
        if (res.analytics.emailConfigured !== undefined) {
          setEmailConfigured(!!res.analytics.emailConfigured);
        }
      }
    }).catch(() => {});
  }, [sessionData.session_token]);

  const loadFinalState = useCallback(() => {
    adminService.getFinalState(sessionData.session_token)
      .then(res => { if (res.success) setFinalState(res); })
      .catch(() => {});
  }, [sessionData.session_token]);

  useEffect(() => { loadFinalState(); }, [loadFinalState]);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      loadUsers();
    } else if (activeTab === 'codes' && codes.length === 0) {
      loadCodes();
    } else if (activeTab === 'universes') {
      loadUniverses();
    } else if (activeTab === 'analytics' && !analytics) {
      // Initial fetch — no start_date so we get the full post-reset window;
      // the response's reset_date then populates the picker.
      loadAnalytics();
    }
  }, [activeTab, users.length, codes.length, analytics, loadUsers, loadCodes, loadUniverses, loadAnalytics]);

  const handleGenerateUserId = async () => {
    try {
      const response = await adminService.generateUserId(sessionData.session_token);
      if (response.success) {
        setNewUserId(response.user_id);
        // Refresh users list if on that tab
        if (activeTab === 'users') loadUsers();
      }
    } catch (err) {
      alert('Error generating user ID');
    }
  };

  const handleSetEffectScale = async (value) => {
    const clamped = Math.max(1, Math.min(99, value));
    setEffectScale(clamped);
    try {
      await adminService.setEffectScale(sessionData.session_token, clamped);
    } catch (err) {
      console.error('Error setting effect scale:', err);
    }
  };

  const handleResetUniverses = async () => {
    if (window.confirm('WARNING: This will reset all dimension data. Continue?')) {
      try {
        const response = await adminService.resetUniverses(sessionData.session_token);
        if (response.success) {
          alert('Dimension statistics reset complete');
          // The reset opens a new phase, which re-arms final-state detection.
          loadFinalState();
        }
      } catch (err) {
        alert('Error resetting dimensions');
      }
    }
  };

  const handleTestAlert = async () => {
    setAlertTestResult('Sending…');
    try {
      const res = await adminService.testFinalStateAlert(sessionData.session_token);
      const detail = (res.notifications || [])
        .map(n => `${n.channel}: ${n.ok ? 'OK' : 'FAILED'} (${n.detail})`)
        .join(' · ');
      setAlertTestResult(detail || res.message);
    } catch (err) {
      setAlertTestResult(err.response?.data?.message || 'Test alert failed');
    }
  };

  const filteredUsers = users.filter(u => {
    if (userFilter === 'used') return u.has_activity;
    if (userFilter === 'unused') return !u.has_activity;
    return true;
  });

  // Denominators for the "(out of XXX)" subtext on the Top 10 tables — the
  // size of the dataset actually behind each ranking, within the selected date
  // window. Codes with zero activations in the window aren't part of the
  // ranking pool, and `analytics.users` only contains users who logged in.
  const rankedCodes = analytics
    ? analytics.codes.filter(c => c.activations > 0).sort((a, b) => b.activations - a.activations)
    : [];
  const activeCodeCount = rankedCodes.length;
  const activeUserCount = analytics ? analytics.users.length : 0;

  // Invalid-code attempts, already ranked by the backend. Each entry is a
  // distinct attempted string, so the array length is the count of unique
  // invalid codes across the selected window.
  const invalidCodes = analytics ? (analytics.invalid_codes || []) : [];

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  return (
    <div className="admin-panel-container">
      {/* Two renderings of the same control, swapped by breakpoint in CSS: the
          tab strip on desktop, a native picker on phones where five tabs would
          otherwise wrap to three rows. */}
      <div className="admin-tabs" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-tab-picker">
        <label htmlFor="admin-tab-select" className="sr-only">Admin section</label>
        <select
          id="admin-tab-select"
          className="admin-tab-select"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
        >
          {TABS.map(tab => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>
      </div>

      <div className="admin-tab-content">
        {activeTab === 'actions' && (
          <div className="admin-actions">
            <button onClick={handleGenerateUserId} className="admin-action-button">
              Generate User ID
            </button>
            <button
              onClick={handleToggleTerminalLock}
              className={`admin-action-button${terminalLocked ? ' danger' : ''}`}
            >
              TERMINAL: {terminalLocked ? '[ LOCKED ]' : '[ UNLOCKED ]'}
            </button>
            <button
              onClick={handleToggleAutoEmail}
              className={`admin-action-button${autoSendEmail ? '' : ' muted'}`}
            >
              AUTO-EMAIL REPORT: {autoSendEmail ? '[ ON ]' : '[ OFF ]'}
            </button>
            <div className="admin-action-note">
              {!emailConfigured
                ? '⚠ No mail transport configured on the server — nothing will send either way.'
                : autoSendEmail
                  ? 'Impact reports send automatically to visitors with an email on file.'
                  : 'Automatic sends are paused. Visitors can still request their report from the results screen.'}
            </div>
            <button onClick={handleResetUniverses} className="admin-action-button danger">
              Reset Dimension Statistics
            </button>
            <div className="effect-scale-control">
              <span className="effect-scale-label">EFFECT SCALE MULTIPLIER</span>
              <div className="effect-scale-selector">
                <button
                  className="scale-btn"
                  onClick={() => handleSetEffectScale(effectScale - 1)}
                  disabled={effectScale <= 1}
                >−</button>
                <select
                  className="scale-select"
                  value={effectScale}
                  onChange={(e) => handleSetEffectScale(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 99 }, (_, i) => i + 1).map(v => (
                    <option key={v} value={v}>{v}x</option>
                  ))}
                </select>
                <button
                  className="scale-btn"
                  onClick={() => handleSetEffectScale(effectScale + 1)}
                  disabled={effectScale >= 99}
                >+</button>
              </div>
            </div>
            {newUserId && (
              <div className="new-user-id-display">
                <span className="new-id-label">NEW USER ID:</span>
                <span className="new-id-value">{newUserId}</span>
              </div>
            )}
            {terminalLocked && (
              <div className="terminal-locked-banner">
                ⚠ TERMINAL LOCKED — visitors are being turned away. Admin IDs still have access.
              </div>
            )}

            {finalState && (
              <div className={`final-state-watch${finalState.is_final ? ' reached' : ''}`}>
                <div className="final-state-watch-header">
                  <span className="final-state-watch-title">FINAL STATE WATCH</span>
                  <span className="final-state-watch-count">
                    {finalState.locked_universes} / {finalState.total_universes} LOCKED
                    {' · '}PHASE {finalState.phase_number}
                  </span>
                </div>

                <div className="final-state-watch-line">
                  {finalState.is_final
                    ? 'Every universe is locked. The network has reached its final state.'
                    : 'Alert fires automatically the moment every universe reaches TRANSCENDED or QUARANTINED.'}
                </div>

                <div className="final-state-watch-line">
                  Channels:{' '}
                  <span className={finalState.channels_configured.email ? 'ok' : 'off'}>
                    email {finalState.channels_configured.email ? 'ON' : 'not configured'}
                  </span>
                  {' · '}
                  <span className={finalState.channels_configured.webhook ? 'ok' : 'off'}>
                    webhook {finalState.channels_configured.webhook ? 'ON' : 'not configured'}
                  </span>
                </div>

                {finalState.last_event && (
                  <div className="final-state-watch-line">
                    Last recorded: phase {finalState.last_event.phase_number} on{' '}
                    {formatDate(finalState.last_event.detected_at)}
                    {finalState.last_event.notifications?.length
                      ? ` — ${finalState.last_event.notifications.map(n => `${n.channel} ${n.ok ? 'OK' : 'FAILED'}`).join(', ')}`
                      : ''}
                  </div>
                )}

                <button onClick={handleTestAlert} className="admin-action-button">
                  Send Test Alert
                </button>
                {alertTestResult && (
                  <div className="final-state-watch-line result">{alertTestResult}</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="admin-users">
            {loading ? (
              <div className="admin-loading">Loading users...</div>
            ) : (
              <>
                <div className="admin-list-header">
                  <div className="admin-list-left">
                    <span className="admin-count">{filteredUsers.length} of {users.length} users</span>
                    <div className="user-filter-buttons">
                      <button
                        className={`filter-btn ${userFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setUserFilter('all')}
                      >ALL</button>
                      <button
                        className={`filter-btn used ${userFilter === 'used' ? 'active' : ''}`}
                        onClick={() => setUserFilter('used')}
                      >USED</button>
                      <button
                        className={`filter-btn unused ${userFilter === 'unused' ? 'active' : ''}`}
                        onClick={() => setUserFilter('unused')}
                      >UNUSED</button>
                    </div>
                  </div>
                  <button onClick={loadUsers} className="admin-refresh">REFRESH</button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>USER ID</th>
                        <th>ROLE</th>
                        <th>STATUS</th>
                        <th>LAST USED</th>
                        <th>USES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(user => (
                        <tr key={user.user_id}>
                          <td className="user-id-cell">{user.user_id}</td>
                          <td>
                            <span className={`role-badge ${user.is_admin ? 'admin' : 'visitor'}`}>
                              {user.is_admin ? 'ADMIN' : 'VISITOR'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${user.has_activity ? 'used' : 'unused'}`}>
                              {user.has_activity ? 'USED' : 'UNUSED'}
                            </span>
                          </td>
                          <td className="date-cell">{formatDate(user.last_used)}</td>
                          <td className="count-cell">{user.usage_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'universes' && (
          <div className="admin-universes">
            {loading ? (
              <div className="admin-loading">Loading universes...</div>
            ) : (
              <>
                <div className="admin-list-header">
                  <span className="admin-count">{universes.length} universes</span>
                  <button onClick={loadUniverses} className="admin-refresh">REFRESH</button>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>STATUS</th>
                        <th>CASES</th>
                        <th>MAX</th>
                        <th>%</th>
                        <th>CAPACITY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {universes.map(u => {
                        const pct = u.initializationCases > 0
                          ? Math.round((u.currentCases / u.initializationCases) * 100)
                          : 0;
                        const statusClass = u.status === 'LIBERATED' ? 'liberated'
                          : u.status === 'PRESERVED' ? 'preserved' : 'compromised';
                        return (
                          <tr key={u._id}>
                            <td className="universe-name-cell">{u.name}</td>
                            <td>
                              <span className={`status-badge ${statusClass}`}>{u.status}</span>
                            </td>
                            <td className="count-cell">{u.currentCases.toLocaleString()}</td>
                            <td className="count-cell">{u.initializationCases.toLocaleString()}</td>
                            <td className="count-cell">{pct}%</td>
                            <td className="capacity-cell">
                              <div className="capacity-bar">
                                <div
                                  className={`capacity-fill ${statusClass}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'codes' && (
          <div className="admin-codes">
            {loading ? (
              <div className="admin-loading">Loading codes...</div>
            ) : (
              <>
                <div className="admin-list-header">
                  <span className="admin-count">{codes.length} codes</span>
                  <button onClick={loadCodes} className="admin-refresh">REFRESH</button>
                </div>
                <div className="admin-codes-list">
                  {codes.map(code => (
                    <div key={code.code} className="admin-code-card">
                      <div
                        className="admin-code-header"
                        onClick={() => setExpandedCode(expandedCode === code.code ? null : code.code)}
                      >
                        <div className="admin-code-info">
                          <span className={`admin-code-value ${code.alignment.toLowerCase()}`}>
                            {code.code}
                          </span>
                          <span className="admin-code-name">{code.name || 'Unnamed'}</span>
                        </div>
                        <div className="admin-code-meta">
                          <span className="admin-code-tier">T{code.tier}</span>
                          <span className={`admin-code-alignment ${code.alignment.toLowerCase()}`}>
                            {code.alignment}
                          </span>
                          {code.is_cure_code && <span className="cure-badge">CURE</span>}
                          {!code.is_active && <span className="inactive-badge">INACTIVE</span>}
                          <span className="expand-icon">
                            {expandedCode === code.code ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>

                      {expandedCode === code.code && (
                        <div className="admin-code-effects">
                          {code.description && (
                            <p className="admin-code-desc">{code.description}</p>
                          )}
                          {code.effects.length === 0 ? (
                            <div className="no-effects-msg">No effects defined</div>
                          ) : (
                            <table className="effects-table">
                              <thead>
                                <tr>
                                  <th>DIMENSION</th>
                                  <th>EFFECT</th>
                                  <th>TYPE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {code.effects.map((effect, i) => (
                                  <tr key={i}>
                                    <td>{effect.universe}</td>
                                    <td className={effect.effect_value < 0 ? 'effect-neg' : 'effect-pos'}>
                                      {effect.effect_value > 0 ? '+' : ''}{effect.effect_value.toLocaleString()}
                                    </td>
                                    <td className="effect-type-cell">
                                      {effect.effect_type}
                                      {effect.is_post_cure && ' (post-cure)'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="admin-analytics">
            {loading || !analytics ? (
              <div className="admin-loading">Loading analytics...</div>
            ) : (
              <>
                <div className="admin-list-header">
                  <div className="dataset-since">
                    <label htmlFor="analytics-phase" className="dataset-since-label">PHASE</label>
                    <select
                      id="analytics-phase"
                      className="dataset-since-input dataset-phase-select"
                      value={selectedPhase}
                      onChange={(e) => handlePhaseChange(e.target.value)}
                    >
                      {(analytics.phases || []).slice().reverse().map(p => (
                        <option key={p.phase_number} value={String(p.phase_number)}>
                          {phaseOptionLabel(p)}
                        </option>
                      ))}
                      <option value="all">ALL PHASES</option>
                    </select>
                    <label htmlFor="analytics-start-date" className="dataset-since-label">FROM</label>
                    <input
                      id="analytics-start-date"
                      type="date"
                      className="dataset-since-input"
                      min={analytics.phase_start_date ? analytics.phase_start_date.slice(0, 10) : undefined}
                      max={analyticsEndDate || TODAY}
                      value={analyticsStartDate}
                      onChange={(e) => handleAnalyticsRangeChange('from', e.target.value)}
                    />
                    <label htmlFor="analytics-end-date" className="dataset-since-label">TO</label>
                    <input
                      id="analytics-end-date"
                      type="date"
                      className="dataset-since-input"
                      min={analyticsStartDate || (analytics.phase_start_date ? analytics.phase_start_date.slice(0, 10) : undefined)}
                      max={analytics.phase_end_date ? analytics.phase_end_date.slice(0, 10) : TODAY}
                      value={analyticsEndDate}
                      onChange={(e) => handleAnalyticsRangeChange('to', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => loadAnalytics(analyticsStartDate, analyticsEndDate, selectedPhase)}
                    className="admin-refresh"
                  >REFRESH</button>
                </div>

                {selectedPhase === 'all' && (
                  <div className="phase-mix-warning">
                    ALL PHASES aggregates windows that ran with different code
                    catalogs and effect scales. Code activation counts and
                    per-user rates are sums across those configurations, not a
                    like-for-like comparison.
                  </div>
                )}

                {analytics.choice_distribution && (
                  <div className="analytics-section">
                    <div className="analytics-section-header">
                      <h4 className="analytics-section-title">CHOICE POPULARITY</h4>
                      <span className="analytics-meta">
                        {analytics.choice_distribution.total_users} {analytics.choice_distribution.total_users === 1 ? 'USER' : 'USERS'}
                      </span>
                    </div>
                    {analytics.choice_distribution.total_users === 0 ? (
                      <div className="no-effects-msg">No finalized sessions yet</div>
                    ) : (
                      <>
                        <div className="choice-popularity">
                          <div className="choice-stat containment">
                            <span className="choice-label">CONTAINMENT</span>
                            <span className="choice-value">
                              {analytics.choice_distribution.containment_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="choice-stat proliferation">
                            <span className="choice-label">PROLIFERATION</span>
                            <span className="choice-value">
                              {analytics.choice_distribution.proliferation_pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="choice-bar">
                          <div
                            className="choice-bar-fill containment"
                            style={{ width: `${analytics.choice_distribution.containment_pct}%` }}
                          />
                          <div
                            className="choice-bar-fill proliferation"
                            style={{ width: `${analytics.choice_distribution.proliferation_pct}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="analytics-section">
                  <div className="analytics-section-header">
                    <h4 className="analytics-section-title">
                      TOP 10 CODES
                      <span className="analytics-denominator">
                        (out of {activeCodeCount} activated)
                      </span>
                    </h4>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>CODE</th>
                          <th>ACTIVATIONS</th>
                          <th>TRANSMISSIONS</th>
                          <th>% OF USERS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedCodes
                          .slice(0, 10)
                          .map(c => (
                            <tr key={c.code}>
                              <td className="user-id-cell">{c.code}</td>
                              <td className="count-cell">{c.activations}</td>
                              <td className="count-cell">{c.transmissions}</td>
                              <td className="count-cell">{c.user_percentage.toFixed(1)}%</td>
                            </tr>
                          ))}
                        {rankedCodes.length === 0 && (
                          <tr><td colSpan="4" className="no-effects-msg">No codes recorded</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="analytics-section">
                  <div className="analytics-section-header">
                    <h4 className="analytics-section-title">
                      TOP 10 INVALID CODES
                      <span className="analytics-denominator">
                        (out of {invalidCodes.length} unique)
                      </span>
                    </h4>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>CODE</th>
                          <th>ATTEMPTS</th>
                          <th>USERS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invalidCodes
                          .slice(0, 10)
                          .map(c => (
                            <tr key={c.code}>
                              <td className="user-id-cell">{c.code}</td>
                              <td className="count-cell">{c.attempts}</td>
                              <td className="count-cell">{c.user_count}</td>
                            </tr>
                          ))}
                        {invalidCodes.length === 0 && (
                          <tr><td colSpan="3" className="no-effects-msg">No invalid codes recorded</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="analytics-section">
                  <div className="analytics-section-header">
                    <h4 className="analytics-section-title">
                      TOP 10 USERS
                      <span className="analytics-denominator">
                        (out of {activeUserCount} active)
                      </span>
                    </h4>
                    <div className="user-filter-buttons">
                      <button
                        className={`filter-btn ${userSort === 'logins' ? 'active' : ''}`}
                        onClick={() => setUserSort('logins')}
                      >LOGINS</button>
                      <button
                        className={`filter-btn ${userSort === 'codes' ? 'active' : ''}`}
                        onClick={() => setUserSort('codes')}
                      >CODES</button>
                    </div>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>USER ID</th>
                          <th>LOGINS</th>
                          <th>CODES USED</th>
                          <th>INVALID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...analytics.users]
                          .sort((a, b) => userSort === 'logins'
                            ? b.login_count - a.login_count
                            : b.codes_used_count - a.codes_used_count)
                          .slice(0, 10)
                          .map(u => (
                            <tr key={u.user_id}>
                              <td className="user-id-cell">{u.user_id}</td>
                              <td className="count-cell">{u.login_count}</td>
                              <td className="count-cell">{u.codes_used_count}</td>
                              <td className="count-cell">{u.invalid_codes_count ?? 0}</td>
                            </tr>
                          ))}
                        {analytics.users.length === 0 && (
                          <tr><td colSpan="4" className="no-effects-msg">No users with logins yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
