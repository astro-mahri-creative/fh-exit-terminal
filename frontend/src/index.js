import React from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';
import App from './App';
import { applyKioskViewport } from './kiosk';

// Before first paint, so the kiosk never renders at a scale it then has to
// correct.
applyKioskViewport();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
