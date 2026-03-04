import React, { useState, useEffect } from 'react';
import './App.css';
import WelcomeScreen from './components/WelcomeScreen';
import CodeEntryScreen from './components/CodeEntryScreen';
import ResultsScreen from './components/ResultsScreen';

function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome', 'codeEntry', 'results'
  const [sessionData, setSessionData] = useState(null);
  const [resultsData, setResultsData] = useState(null);

  const handleSessionStart = (data) => {
    setSessionData(data);
    setScreen('codeEntry');
  };

  const handleFinalize = (data) => {
    setResultsData(data);
    setScreen('results');
  };

  const handleReset = () => {
    setScreen('welcome');
    setSessionData(null);
    setResultsData(null);
  };

  // Auto-reset after 30 seconds on results screen
  useEffect(() => {
    if (screen === 'results') {
      const timer = setTimeout(() => {
        handleReset();
      }, 30000);
      
      return () => clearTimeout(timer);
    }
  }, [screen]);

  return (
    <div className="App">
      {screen === 'welcome' && (
        <WelcomeScreen onSessionStart={handleSessionStart} />
      )}
      {screen === 'codeEntry' && sessionData && (
        <CodeEntryScreen 
          sessionData={sessionData}
          onFinalize={handleFinalize}
        />
      )}
      {screen === 'results' && resultsData && (
        <ResultsScreen 
          resultsData={resultsData}
          sessionData={sessionData}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

export default App;
