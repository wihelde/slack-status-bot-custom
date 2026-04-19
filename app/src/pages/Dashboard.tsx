import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';
import { IPCService } from '../services/ipcService';
import { CustomStatusConfig, getDefaultStatusConfiguration } from '../config/statusConfig';
import { buildSourceDisplayStates, SOURCE_ICONS, SOURCE_LABELS, SourceDisplayState } from '../config/sourceCatalog';
import type { AppSnapshot } from '../contracts/appSnapshot';
import HolidayModal from '../components/HolidayModal';

const Dashboard: React.FC = () => {
  const [sources, setSources] = useState<SourceDisplayState[]>(buildSourceDisplayStates());

  const [currentStatus, setCurrentStatus] = useState({ emoji: '', text: '' });
  const [daemonRunning, setDaemonRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [statusConfig, setStatusConfig] = useState<CustomStatusConfig[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; releaseDate: string } | null>(null);

  const applyAppSnapshot = (snapshot: AppSnapshot) => {
    setCurrentStatus({
      emoji: snapshot.status.emoji,
      text: snapshot.status.text,
    });
    setDaemonRunning(snapshot.daemon.running);
    setSources(buildSourceDisplayStates(snapshot.sources));
    setUpdateAvailable(snapshot.update);
  };

  const refreshDashboardState = async () => {
    try {
      const appSnapshot = await IPCService.getAppSnapshot();
      if (!appSnapshot) {
        throw new Error('App snapshot unavailable');
      }
      applyAppSnapshot(appSnapshot);
    } catch (error) {
      console.error('Error loading dashboard snapshot:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshDashboardState();
    loadStatusConfiguration();

    const cleanupSnapshot = IPCService.onAppSnapshotChanged((signal) => {
      console.log('[Dashboard] Refreshing renderer state from app snapshot', signal);
      void refreshDashboardState();
    });

    const cleanupHoliday = IPCService.onOpenHolidayModal(() => {
      console.log('[Dashboard] Received open-holiday-modal event from tray');
      setShowHolidayModal(true);
    });

    return () => {
      cleanupSnapshot?.();
      cleanupHoliday?.();
    };
  }, []);

  const loadStatusConfiguration = async () => {
    try {
      const config = await IPCService.getStatusConfiguration();
      if (config) {
        setStatusConfig(config);
      } else {
        setStatusConfig(getDefaultStatusConfiguration());
      }
    } catch (error) {
      console.error('Error loading status configuration:', error);
      setStatusConfig(getDefaultStatusConfiguration());
    }
  };

  const getStatusById = (id: string): CustomStatusConfig | undefined => {
    const found = statusConfig.find(s => s.id === id);
    if (!found) {
      const defaults = getDefaultStatusConfiguration();
      return defaults.find(s => s.id === id);
    }
    return found;
  };

  const handleToggleSource = async (sourceName: string) => {
    const source = sources.find(s => s.name === sourceName);
    if (source) {
      await IPCService.toggleSource(sourceName as any, !source.enabled);
      await refreshDashboardState();
    }
  };

  const handleGoOnline = async () => {
    await IPCService.goOnline();
    await refreshDashboardState();
  };

  const handleGoAway = async () => {
    await IPCService.goAway();
    await refreshDashboardState();
  };

  const handleSetStatus = async (emoji: string, message: string) => {
    await IPCService.setStatus(emoji, message);
    await refreshDashboardState();
  };

  const handleSetHoliday = async (returnDate: string) => {
    await IPCService.setHoliday(returnDate);
    await refreshDashboardState();
  };

  if (loading) {
    return <div className="dashboard"><p>Loading...</p></div>;
  }

  return (
    <div className="dashboard">
      {updateAvailable && (
        <div className="update-banner">
          <div className="update-content">
            <span className="update-icon">🚀</span>
            <div className="update-text">
              <strong>Update available!</strong>
              <p>Version {updateAvailable.version} is ready to install</p>
            </div>
            <a 
              href={`https://gitlab.com/wihel_de/slack-status-bot-custom/-/releases/v${updateAvailable.version}`}
              target="_blank"
              rel="noopener noreferrer"
              className="update-link"
            >
              Download
            </a>
            <button 
              className="update-close"
              onClick={() => setUpdateAvailable(null)}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="dashboard-header">
        <h1>Slack Status Bot</h1>
        <div className={`daemon-status ${daemonRunning ? 'running' : 'stopped'}`}>
          {daemonRunning ? '🟢 Running' : '🔴 Stopped'}
        </div>
      </div>

      <div className="dashboard-card">
        <h2>Current Status</h2>
        <div className="current-status-display">
          <span className="status-emoji">{currentStatus.emoji || '🟢'}</span>
          <span className="status-text">{currentStatus.text || 'Online'}</span>
        </div>
        <div className="status-control">
          <div className="button-group">
            <button
              className="status-btn online"
              onClick={handleGoOnline}
              title="Go Online"
            >
              🟢 Online
            </button>
            <button
              className="status-btn away"
              onClick={handleGoAway}
              title="Go Away"
            >
              🟡 Away
            </button>
          </div>
        </div>
      </div>

      <div className={`dashboard-card ${!daemonRunning ? 'disabled-card' : ''}`}>
        <h2>Active Sources</h2>
        {!daemonRunning && (
          <div className="sources-disabled-notice">
            ⚠️ Configure a Slack token in Settings to enable source tracking
          </div>
        )}
        <div className={`sources-grid ${!daemonRunning ? 'disabled' : ''}`}>
          {sources.map((source) => (
            <div key={source.name} className={`source-item ${source.isActive ? 'active' : ''}`}>
              <div className="source-header">
                <h3>{SOURCE_ICONS[source.name]} {SOURCE_LABELS[source.name]}</h3>
                <label className={`toggle ${!daemonRunning ? 'disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() => handleToggleSource(source.name)}
                    disabled={!daemonRunning}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <div className={`source-status ${source.isActive ? 'active' : 'inactive'}`}>
                {source.isActive ? '✓ Active' : '○ Inactive'}
              </div>
              {source.message && (
                <div className="source-message">{source.message}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card">
        <h2>Quick Actions</h2>
        <div className="actions-grid">
          {(() => {
            const breakStatus = getStatusById('break');
            return (
              <button
                className="action-btn break"
                onClick={() => breakStatus && handleSetStatus(breakStatus.emoji, breakStatus.message)}
                title="Take a break"
              >
                ☕ Break
              </button>
            );
          })()}
          {(() => {
            const meetingStatus = getStatusById('meeting');
            return (
              <button
                className="action-btn meeting"
                onClick={() => meetingStatus && handleSetStatus(meetingStatus.emoji, meetingStatus.message)}
                title="In a meeting"
              >
                📞 Meeting
              </button>
            );
          })()}
          {(() => {
            const focusStatus = getStatusById('focus');
            return (
              <button
                className="action-btn focus"
                onClick={() => focusStatus && handleSetStatus(focusStatus.emoji, focusStatus.message)}
                title="Focus mode"
              >
                🎯 Focus
              </button>
            );
          })()}
          {(() => {
            const travelStatus = getStatusById('travel');
            return (
              <button
                className="action-btn travel"
                onClick={() => travelStatus && handleSetStatus(travelStatus.emoji, travelStatus.message)}
                title="Traveling"
              >
                ✈️ Travel
              </button>
            );
          })()}
          {(() => {
            const sickStatus = getStatusById('sick');
            return (
              <button
                className="action-btn sick"
                onClick={() => sickStatus && handleSetStatus(sickStatus.emoji, sickStatus.message)}
                title="Out sick"
              >
                🤒 Sick
              </button>
            );
          })()}
          <button
            className="action-btn holiday"
            onClick={() => setShowHolidayModal(true)}
            title="On holiday"
          >
            🏖️ Holiday
          </button>
          {(() => {
            const remeetStatus = getStatusById('remeet');
            return (
              <button
                className="action-btn remeet"
                onClick={() => remeetStatus && handleSetStatus(remeetStatus.emoji, remeetStatus.message)}
                title="Remeet"
              >
                🔄 Remeet
              </button>
            );
          })()}
          {(() => {
            const dogStatus = getStatusById('dog');
            return (
              <button
                className="action-btn dog"
                onClick={() => dogStatus && handleSetStatus(dogStatus.emoji, dogStatus.message)}
                title="With dog"
              >
                🐕 Dog
              </button>
            );
          })()}
        </div>
      </div>

      <HolidayModal
        isOpen={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
        onSetHoliday={handleSetHoliday}
      />
    </div>
  );
};

export default Dashboard;
