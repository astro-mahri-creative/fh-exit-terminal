import React, { useState } from 'react';
import './App.css';
import WelcomeScreen from './components/WelcomeScreen';
import CodeEntryScreen from './components/CodeEntryScreen';
import ChoiceScreen from './components/ChoiceScreen';
import ResultsScreen from './components/ResultsScreen';
import NetworkScreen from './components/NetworkScreen';

function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome', 'codeEntry', 'choice', 'results', 'network'
  const [sessionData, setSessionData] = useState(null);
  const [choiceData, setChoiceData] = useState(null);
  const [resultsData, setResultsData] = useState(null);

  const handleSessionStart = (data) => {
    setSessionData(data);
    setScreen('codeEntry');
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
    </div>
  );
}

export default App;
