import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import FirstRunDialog from './components/FirstRunDialog';
import { IPCService } from './services/ipcService';
import type { AppSnapshot } from './contracts/appSnapshot';

type Page = 'dashboard' | 'settings';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isOnline, setIsOnline] = useState(true);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applySnapshot = (snapshot: AppSnapshot | null) => {
      setIsOnline(snapshot?.daemon.running ?? false);
      setShowFirstRun(snapshot?.setup.isFirstRun ?? false);
    };

    const loadAppState = async () => {
      try {
        const snapshot = await IPCService.getAppSnapshot();
        applySnapshot(snapshot);
      } catch (err) {
        console.error('Error loading app snapshot:', err);
        applySnapshot(null);
      } finally {
        setLoading(false);
      }
    };

    void loadAppState();

    const cleanupSnapshot = IPCService.onAppSnapshotChanged(() => {
      void loadAppState();
    });

    return () => {
      cleanupSnapshot?.();
    };
  }, []);

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (showFirstRun) {
    return <FirstRunDialog onComplete={() => setShowFirstRun(false)} />;
  }

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
