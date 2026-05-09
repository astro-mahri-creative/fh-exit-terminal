import React, { useState, useEffect, useCallback } from 'react';
import { adminService, universeService } from '../services/api';
import './AdminPanel.css';

function AdminPanel({ sessionData }) {
  const [activeTab, setActiveTab] = useState('actions');
  const [users, setUsers] = useState([]);
  const [codes, setCodes] = useState([]);
  const [universes, setUniverses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [expandedCode, setExpandedCode] = useState(null);
  const [userFilter, setUserFilter] = useState('all'); // 'all', 'used', 'unused'
  const [returnMode, setReturnMode] = useState('resume');
  const [effectScale, setEffectScale] = useState(1);

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

  useEffect(() => {
    adminService.getAnalytics(sessionData.session_token).then(res => {
      if (res.success) {
        setReturnMode(res.analytics.sameDayReturnMode || 'resume');
        if (res.analytics.effectScale !== undefined) setEffectScale(res.analytics.effectScale);
      }
    }).catch(() => {});
  }, [sessionData.session_token]);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) {
      loadUsers();
    } else if (activeTab === 'codes' && codes.length === 0) {
      loadCodes();
    } else if (activeTab === 'universes') {
      loadUniverses();
    }
  }, [activeTab, users.length, codes.length, loadUsers, loadCodes, loadUniverses]);

  const handleToggleReturnMode = async () => {
    try {
      const response = await adminService.toggleReturnMode(sessionData.session_token);
      if (response.success) setReturnMode(response.sameDayReturnMode);
    } catch (err) {
      console.error('Error toggling return mode:', err);
    }
  };

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
        }
      } catch (err) {
        alert('Error resetting dimensions');
      }
    }
  };

  const filteredUsers = users.filter(u => {
    if (userFilter === 'used') return u.has_activity;
    if (userFilter === 'unused') return !u.has_activity;
    return true;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  return (
    <div className="admin-panel-container">
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          ACTIONS
        </button>
        <button
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          USERS
        </button>
        <button
          className={`admin-tab ${activeTab === 'universes' ? 'active' : ''}`}
          onClick={() => setActiveTab('universes')}
        >
          UNIVERSES
        </button>
        <button
          className={`admin-tab ${activeTab === 'codes' ? 'active' : ''}`}
          onClick={() => setActiveTab('codes')}
        >
          CODES & EFFECTS
        </button>
      </div>

      <div className="admin-tab-content">
        {activeTab === 'actions' && (
          <div className="admin-actions">
            <button onClick={handleGenerateUserId} className="admin-action-button">
              Generate User ID
            </button>
            <button
              onClick={handleToggleReturnMode}
              className={`admin-action-button${returnMode === 'block' ? ' danger' : ''}`}
            >
              SESSION RETURN: {returnMode === 'resume' ? '[ RESUME ]' : '[ BLOCK ]'}
            </button>
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
      </div>
    </div>
  );
}

export default AdminPanel;
