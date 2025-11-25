import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import { IPCService } from './services/ipcService';

type Page = 'dashboard' | 'settings';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Get initial daemon status
    IPCService.getDaemonStatus().then((status) => {
      if (status?.running) {
        setIsOnline(true);
      }
    });

    // Listen for daemon status changes
    IPCService.onDaemonStatusChange((data) => {
      setIsOnline(data.running || false);
    });
  }, []);

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>Slack Status Bot</h1>
          <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="navbar-menu">
          <button
            className={`nav-button ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentPage('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-button ${currentPage === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentPage('settings')}
          >
            Settings
          </button>
        </div>
      </nav>

      <main className="main-content">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
};

export default App;

