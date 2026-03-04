import React, { useState } from 'react';
import { sessionService } from '../services/api';
import './WelcomeScreen.css';

function WelcomeScreen({ onSessionStart }) {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (userId.length !== 6) {
      setError('User ID must be exactly 6 characters');
      return;
    }

    setLoading(true);
    
    try {
      const response = await sessionService.start(userId);
      
      if (response.success) {
        onSessionStart(response);
      } else {
        setError(response.message || 'Failed to start session');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Connection error. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.toLowerCase().slice(0, 6);
    setUserId(value);
    setError('');
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-container">
        <div className="logo-container">
          <h1 className="project-title">PROJECT LASAGNA</h1>
          <h2 className="terminal-title">EXIT TERMINAL</h2>
        </div>

        <p className="instructions">
          Enter your User ID to access<br/>
          terminal code processing
        </p>

        <form onSubmit={handleSubmit} className="user-id-form">
          <div className="input-group">
            <label htmlFor="userId">User ID:</label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={handleChange}
              placeholder="______"
              className="user-id-input"
              autoComplete="off"
              autoFocus
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="begin-button"
            disabled={loading || userId.length !== 6}
          >
            {loading ? 'CONNECTING...' : 'BEGIN'}
          </button>
        </form>

        <div className="phax-branding">
          <div className="phax-logo">PHAX</div>
          <p className="phax-tagline">DIMENSIONAL CONTAINMENT OPERATIONS</p>
        </div>
      </div>
    </div>
  );
}

export default WelcomeScreen;
