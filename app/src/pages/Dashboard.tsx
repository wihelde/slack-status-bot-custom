import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';
import { IPCService } from '../services/ipcService';
import { STATUS_MESSAGES, CustomStatusConfig, getDefaultStatusConfiguration } from '../config/statusConfig';
import HolidayModal from '../components/HolidayModal';

interface SourceStatus {
  name: string;
  enabled: boolean;
  isActive: boolean;
  message?: string;
}

const Dashboard: React.FC = () => {
  const [sources, setSources] = useState<SourceStatus[]>([
    { name: 'spotify', enabled: true, isActive: false },
    { name: 'appleMusic', enabled: true, isActive: false },
    { name: 'zoom', enabled: true, isActive: false },
    { name: 'teams', enabled: true, isActive: false },
    { name: 'huddle', enabled: true, isActive: false },
  ]);

  const [currentStatus, setCurrentStatus] = useState({ emoji: '', text: '' });
  const [daemonRunning, setDaemonRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [statusConfig, setStatusConfig] = useState<CustomStatusConfig[]>([]);

  useEffect(() => {
    // Initial load
    loadStatus();
    loadStatusConfiguration();
    
    // Listen for status changes from daemon (event-based, not polling)
    IPCService.onStatusChanged((statusData) => {
      console.log('[Dashboard] Status changed event received:', statusData);
      // Update current status with the new data
      setCurrentStatus({ 
        emoji: statusData.emoji || '', 
        text: statusData.message || '' 
      });
      
      // If the change is due to an active/inactive source, reload source statuses
      if (statusData.stateValue === 'activeSource' || statusData.stateValue === 'sourceInactive') {
        console.log('[Dashboard] Source status changed, reloading source statuses', { stateValue: statusData.stateValue });
        (async () => {
          const sourceStatuses = await IPCService.getSourceStatuses();
          if (sourceStatuses) {
            setSources([
              {
                name: 'spotify',
                enabled: sourceStatuses.spotify?.enabled ?? true,
                isActive: sourceStatuses.spotify?.isActive || false,
                message: sourceStatuses.spotify?.message,
              },
              {
                name: 'appleMusic',
                enabled: sourceStatuses.appleMusic?.enabled ?? true,
                isActive: sourceStatuses.appleMusic?.isActive || false,
                message: sourceStatuses.appleMusic?.message,
              },
              {
                name: 'zoom',
                enabled: sourceStatuses.zoom?.enabled ?? true,
                isActive: sourceStatuses.zoom?.isActive || false,
              },
              {
                name: 'teams',
                enabled: sourceStatuses.teams?.enabled ?? true,
                isActive: sourceStatuses.teams?.isActive || false,
              },
              {
                name: 'huddle',
                enabled: sourceStatuses.huddle?.enabled ?? true,
                isActive: sourceStatuses.huddle?.isActive || false,
              },
            ]);
          }
        })();
      }
    });

    // Listen for open-holiday-modal event from tray menu
    IPCService.onOpenHolidayModal(() => {
      console.log('[Dashboard] Received open-holiday-modal event from tray');
      setShowHolidayModal(true);
    });
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

  const loadStatus = async () => {
    try {
      const status = await IPCService.getSlackStatus();
      if (status) {
        setCurrentStatus({ emoji: status.emoji, text: status.text });
      }

      const daemonStatus = await IPCService.getDaemonStatus();
      if (daemonStatus) {
        setDaemonRunning(daemonStatus.running);
      }

      const sourceStatuses = await IPCService.getSourceStatuses();
      if (sourceStatuses) {
        setSources([
          {
            name: 'spotify',
            enabled: sourceStatuses.spotify?.enabled ?? true,
            isActive: sourceStatuses.spotify?.isActive || false,
            message: sourceStatuses.spotify?.message,
          },
          {
            name: 'appleMusic',
            enabled: sourceStatuses.appleMusic?.enabled ?? true,
            isActive: sourceStatuses.appleMusic?.isActive || false,
            message: sourceStatuses.appleMusic?.message,
          },
          {
            name: 'zoom',
            enabled: sourceStatuses.zoom?.enabled ?? true,
            isActive: sourceStatuses.zoom?.isActive || false,
          },
          {
            name: 'teams',
            enabled: sourceStatuses.teams?.enabled ?? true,
            isActive: sourceStatuses.teams?.isActive || false,
          },
          {
            name: 'huddle',
            enabled: sourceStatuses.huddle?.enabled ?? true,
            isActive: sourceStatuses.huddle?.isActive || false,
          },
        ]);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading status:', error);
    }
  };

  const handleToggleSource = async (sourceName: string) => {
    const source = sources.find(s => s.name === sourceName);
    if (source) {
      await IPCService.toggleSource(sourceName as any, !source.enabled);
      loadStatus();
    }
  };

  const handleGoOnline = async () => {
    await IPCService.goOnline();
    loadStatus();
  };

  const handleGoAway = async () => {
    await IPCService.goAway();
    loadStatus();
  };

  const handleSetStatus = async (emoji: string, message: string) => {
    await IPCService.setStatus(emoji, message);
    loadStatus();
  };

  const handleSetHoliday = async (returnDate: string) => {
    await IPCService.setHoliday(returnDate);
    loadStatus();
  };

  const sourceIcons: Record<string, string> = {
    spotify: '🎵',
    appleMusic: '🎶',
    zoom: '📹',
    teams: '👥',
    huddle: '🎧',
  };

  const sourceLabels: Record<string, string> = {
    spotify: 'Spotify',
    appleMusic: 'Apple Music',
    zoom: 'Zoom',
    teams: 'Teams',
    huddle: 'Huddle',
  };

  if (loading) {
    return <div className="dashboard"><p>Loading...</p></div>;
  }

  return (
    <div className="dashboard">
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

      <div className="dashboard-card">
        <h2>Active Sources</h2>
        <div className="sources-grid">
          {sources.map((source) => (
            <div key={source.name} className={`source-item ${source.isActive ? 'active' : ''}`}>
              <div className="source-header">
                <h3>{sourceIcons[source.name]} {sourceLabels[source.name]}</h3>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() => handleToggleSource(source.name)}
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
