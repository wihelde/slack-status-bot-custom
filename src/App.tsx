import React, { useState, useEffect, useRef } from 'react';
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
  const lastOAuthMessage = useRef<string | null>(null);
  const mainContent = useRef<HTMLElement>(null);

  useEffect(() => {
    mainContent.current?.scrollTo(0, 0);
  }, [currentPage]);

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

    const showOAuthResult = async () => {
      const message = (await IPCService.getTokens())?.oauthMessage || null;
      if (message && message !== lastOAuthMessage.current) setCurrentPage('settings');
      lastOAuthMessage.current = message;
    };
    void showOAuthResult();

    const cleanupSnapshot = IPCService.onAppSnapshotChanged(signal => {
      void loadAppState();
      if (signal.reason === 'setup') void showOAuthResult();
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
      <nav className="navbar" onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--glass-x', `${event.clientX - bounds.left}px`);
      }} onPointerLeave={event => event.currentTarget.style.removeProperty('--glass-x')}>
        <div className="navbar-brand">
          <h1>Slack Status Bot</h1>
          <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="navbar-menu">
          <button
            className={`nav-button ${currentPage === 'dashboard' ? 'active' : ''}`}
            aria-current={currentPage === 'dashboard' ? 'page' : undefined}
            onClick={() => setCurrentPage('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-button ${currentPage === 'settings' ? 'active' : ''}`}
            aria-current={currentPage === 'settings' ? 'page' : undefined}
            onClick={() => setCurrentPage('settings')}
          >
            Settings
          </button>
        </div>
      </nav>

      <main className="main-content" ref={mainContent}>
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'settings' && <Settings />}
      </main>
    </div>
  );
};

export default App;
