import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { reportRendererError } from './rendererDiagnostics';
import './styles/Materials.css';
import { applyThemePreference, readThemePreference } from './theme';

applyThemePreference(readThemePreference());

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
  { onUncaughtError: error => reportRendererError(error, 'react.render'),
    onCaughtError: error => reportRendererError(error, 'react.render') }
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
