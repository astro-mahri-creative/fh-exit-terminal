import React, { useState } from 'react';
import './App.css';
import WelcomeScreen from './components/WelcomeScreen';
import CodeEntryScreen from './components/CodeEntryScreen';
import ChoiceScreen from './components/ChoiceScreen';
import ResultsScreen from './components/ResultsScreen';
import NetworkScreen from './components/NetworkScreen';
import TVWallScreen from './components/TVWallScreen';
import ScrollIndicator from './components/ScrollIndicator';

// The kiosk TV Wall lives on its own route (/tvwall) entirely outside the
// centered/padded .App shell, with no code entry. There's no router; we read the
// path once. Netlify's /* → /index.html fallback (netlify.toml) serves it.
const isTvWallPath = () =>
  window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/tvwall';

function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome', 'codeEntry', 'choice', 'results', 'network', 'tvwall'
  const [sessionData, setSessionData] = useState(null);
  const [choiceData, setChoiceData] = useState(null);
  const [resultsData, setResultsData] = useState(null);

  const handleSessionStart = (data) => {
    setSessionData(data);
    setScreen('codeEntry');
  };

  // The email captured at the "Save Progress?" gate rides along on sessionData
  // so the impact report can pre-populate its field instead of asking twice.
  const handleEmailCaptured = (email) => {
    setSessionData(prev => (prev ? { ...prev, email } : prev));
  };

  const handlePreview = (data) => {
    setChoiceData(data);
    setScreen('choice');
  };

  const handleChoiceConfirmed = (data) => {
    setResultsData(data);
    setScreen('results');
  };

  const handleReset = () => {
    setScreen('welcome');
    setSessionData(null);
    setChoiceData(null);
    setResultsData(null);
  };

  // Standalone kiosk route — renders full-viewport, outside the .App shell.
  if (isTvWallPath()) {
    return <TVWallScreen />;
  }

  return (
    <div className="App">
      {screen === 'welcome' && (
      <WelcomeScreen onSessionStart={handleSessionStart} onViewNetwork={() => setScreen('network')} />
      )}
      {screen === 'codeEntry' && sessionData && (
        <CodeEntryScreen
          sessionData={sessionData}
          onPreview={handlePreview}
          onLogout={handleReset}
          onEmailCaptured={handleEmailCaptured}
        />
      )}
      {screen === 'choice' && choiceData && (
        <ChoiceScreen
          choiceData={choiceData}
          sessionData={sessionData}
          onChoiceConfirmed={handleChoiceConfirmed}
        />
      )}
      {screen === 'results' && resultsData && (
        <ResultsScreen
          resultsData={resultsData}
          sessionData={sessionData}
          onReset={handleReset}
        />
      )}
      {screen === 'network' && (
        <NetworkScreen onBack={() => setScreen('welcome')} />
      )}

      <ScrollIndicator />
    </div>
  );
}

export default App;
