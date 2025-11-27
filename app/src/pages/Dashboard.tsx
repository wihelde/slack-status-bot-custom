import React, { useState, useEffect } from 'react';
import '../styles/Dashboard.css';
import { IPCService } from '../services/ipcService';
import { STATUS_MESSAGES } from '../config/statusConfig';
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

  useEffect(() => {
    // Initial load
    loadStatus();
    
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
                enabled: true,
                isActive: sourceStatuses.spotify?.isActive || false,
                message: sourceStatuses.spotify?.message,
              },
              {
                name: 'appleMusic',
                enabled: true,
                isActive: sourceStatuses.appleMusic?.isActive || false,
                message: sourceStatuses.appleMusic?.message,
              },
              {
                name: 'zoom',
                enabled: true,
                isActive: sourceStatuses.zoom?.isActive || false,
              },
              {
                name: 'teams',
                enabled: true,
                isActive: sourceStatuses.teams?.isActive || false,
              },
              {
                name: 'huddle',
                enabled: true,
                isActive: sourceStatuses.huddle?.isActive || false,
              },
            ]);
          }
        })();
      }
    });
  }, []);

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
            enabled: true,
            isActive: sourceStatuses.spotify?.isActive || false,
            message: sourceStatuses.spotify?.message,
          },
          {
            name: 'appleMusic',
            enabled: true,
            isActive: sourceStatuses.appleMusic?.isActive || false,
            message: sourceStatuses.appleMusic?.message,
          },
          {
            name: 'zoom',
            enabled: true,
            isActive: sourceStatuses.zoom?.isActive || false,
          },
          {
            name: 'teams',
            enabled: true,
            isActive: sourceStatuses.teams?.isActive || false,
          },
          {
            name: 'huddle',
            enabled: true,
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
          <button
            className="action-btn break"
            onClick={() => handleSetStatus(STATUS_MESSAGES.BREAK_EMOJI, STATUS_MESSAGES.BREAK_MESSAGE)}
            title="Take a break"
          >
            ☕ Break
          </button>
          <button
            className="action-btn meeting"
            onClick={() => handleSetStatus(STATUS_MESSAGES.MEETING_EMOJI, STATUS_MESSAGES.MEETING_MESSAGE)}
            title="In a meeting"
          >
            📞 Meeting
          </button>
          <button
            className="action-btn focus"
            onClick={() => handleSetStatus(STATUS_MESSAGES.FOCUS_EMOJI, STATUS_MESSAGES.FOCUS_MESSAGE)}
            title="Focus mode"
          >
            🎯 Focus
          </button>
          <button
            className="action-btn travel"
            onClick={() => handleSetStatus(STATUS_MESSAGES.TRAVEL_EMOJI, STATUS_MESSAGES.TRAVEL_MESSAGE)}
            title="Traveling"
          >
            ✈️ Travel
          </button>
          <button
            className="action-btn sick"
            onClick={() => handleSetStatus(STATUS_MESSAGES.SICK_EMOJI, STATUS_MESSAGES.SICK_MESSAGE)}
            title="Out sick"
          >
            🤒 Sick
          </button>
          <button
            className="action-btn holiday"
            onClick={() => setShowHolidayModal(true)}
            title="On holiday"
          >
            🏖️ Holiday
          </button>
          <button
            className="action-btn remeet"
            onClick={() => handleSetStatus(STATUS_MESSAGES.REMEET_EMOJI, STATUS_MESSAGES.REMEET_MESSAGE)}
            title="Remeet"
          >
            🔄 Remeet
          </button>
          <button
            className="action-btn dog"
            onClick={() => handleSetStatus(STATUS_MESSAGES.DOG_EMOJI, STATUS_MESSAGES.DOG_MESSAGE)}
            title="With dog"
          >
            🐕 Dog
          </button>
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
