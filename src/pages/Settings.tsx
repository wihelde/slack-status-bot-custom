import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';
import { IPCService } from '../services/ipcService';
import LogViewer from '../components/LogViewer';
import { StatusConfigEditor } from '../components/StatusConfigEditor';
import { DEFAULT_SOURCE_ORDER, SOURCE_CATALOG, SourceName } from '../config/sourceCatalog';
import type { WorkspaceConnectionSummary } from '../contracts/ipc';
import { buildSetupLink } from '../contracts/setupLink';
import { applyThemePreference, readThemePreference, ThemePreference } from '../theme';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'workspaces' | 'automation' | 'logs'>('workspaces');
  const [setupLink, setSetupLink] = useState('');
  const [clientId, setClientId] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [showLinkGenerator, setShowLinkGenerator] = useState(false);
  const [oauthMessage, setOAuthMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState<string[]>([]);
  const [connections, setConnections] = useState<WorkspaceConnectionSummary[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<SourceName[]>([...DEFAULT_SOURCE_ORDER]);
  const [draggedSource, setDraggedSource] = useState<SourceName | null>(null);
  const [logLevel, setLogLevelState] = useState<'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>('ERROR');
  const [logLevelSaving, setLogLevelSaving] = useState(false);
  const [meetingDnd, setMeetingDnd] = useState(true);
  const [meetingDndSaving, setMeetingDndSaving] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    loadConfig();
    return IPCService.onAppSnapshotChanged(signal => {
      if (signal.reason === 'setup') void loadConfig();
    });
  }, []);

  const loadConfig = async () => {
    try {
      const tokenData = await IPCService.getTokens();
      if (tokenData) {
        setTokens(tokenData.tokens || []);
        setConnections(tokenData.connections);
        setConnectionError(tokenData.connectionError);
        setOAuthMessage(tokenData.oauthMessage);
      }

      setMeetingDnd((await IPCService.getMeetingDnd()) ?? true);

      // Load source order
      const order = await IPCService.getSourceOrder();
      if (order) {
        console.log('[Settings] Source order loaded:', order);
        setSourceOrder(order);
      }

      // Load log level
      const levelResult = await IPCService.getLogLevel();
      if (levelResult?.success && levelResult?.logLevel) {
        console.log('[Settings] Log level loaded:', levelResult.logLevel);
        setLogLevelState(levelResult.logLevel);
      }

      // Load auto-launch setting
      const autoLaunchStatus = await IPCService.getAutoLaunch();
      if (autoLaunchStatus !== null) {
        console.log('[Settings] Auto-launch status loaded:', autoLaunchStatus);
        setAutoLaunch(autoLaunchStatus);
      }

      const appSnapshot = await IPCService.getAppSnapshot();
      setAppVersion(appSnapshot?.app.version || '');

      setLoading(false);
    } catch (err) {
      console.error('[Settings] Error loading config:', err);
      setLoading(false);
    }
  };

  const handleOpenSetupLink = async () => {
    try {
      setError('');
      const result = await IPCService.openSetupLink(setupLink.trim());
      if (result) setError(result);
      else setSetupLink('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Setup Link');
    }
  };

  const handleReconnect = async (teamId: string) => {
    try {
      setError('');
      const result = await IPCService.reconnectWorkspace(teamId);
      if (result) setError(result);
    } catch {
      setError('Could not reconnect workspace');
    }
  };

  const handleRemoveWorkspace = async (teamId: string) => {
    try {
      setError('');
      const result = await IPCService.removeWorkspace(teamId);
      if (result) setError(result);
      else await loadConfig();
    } catch {
      setError('Could not remove workspace');
    }
  };

  const handleGenerateLink = () => {
    try {
      setError('');
      setGeneratedLink(buildSetupLink({ clientId: clientId.trim(), expectedTeamId: workspaceId.trim() || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Slack registration');
    }
  };

  const handleDeleteTokens = async () => {
    try {
      setError('');
      const success = await IPCService.deleteTokens();
      if (success) {
        setTokens([]);
        setConnections([]);
        setSaved(true);
        setShowDeleteConfirm(false);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to delete tokens');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting tokens');
    }
  };

  const handleDragStart = (source: SourceName) => {
    setDraggedSource(source);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetSource: SourceName) => {
    if (!draggedSource || draggedSource === targetSource) return;

    const newOrder = [...sourceOrder];
    const draggedIndex = newOrder.indexOf(draggedSource);
    const targetIndex = newOrder.indexOf(targetSource);

    [newOrder[draggedIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[draggedIndex]];

    setSourceOrder(newOrder);
    setDraggedSource(null);
  };

  const handleSaveSourceOrder = async () => {
    try {
      const success = await IPCService.setSourceOrder(sourceOrder);
      if (success) {
        setSaved(true);
        console.log('[Settings] Source order saved:', sourceOrder);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save source order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving source order');
    }
  };

  const handleLogLevelChange = async (newLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') => {
    try {
      setLogLevelSaving(true);
      const result = await IPCService.setLogLevel(newLevel);
      if (result?.success) {
        setLogLevelState(newLevel);
        console.log('[Settings] Log level changed to:', newLevel);
      } else {
        setError('Failed to change log level');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error changing log level');
    } finally {
      setLogLevelSaving(false);
    }
  };

  const handleAutoLaunchChange = async (enabled: boolean) => {
    setAutoLaunchLoading(true);
    try {
      const success = await IPCService.setAutoLaunch(enabled);
      if (success) {
        setAutoLaunch(enabled);
        console.log('[Settings] Auto-launch changed to:', enabled);
      } else {
        console.error('[Settings] Failed to set auto-launch');
      }
    } catch (err) {
      console.error('[Settings] Error changing auto-launch:', err);
    } finally {
      setAutoLaunchLoading(false);
    }
  };

  const sourceLabels: Record<string, { name: string; emoji: string }> = Object.fromEntries(
    SOURCE_CATALOG.map(source => [source.id, { name: source.displayName, emoji: source.icon }])
  );

  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    document.querySelector('.main-content')?.scrollTo(0, 0);
  };

  if (loading) {
    return <div className="settings"><p>Loading...</p></div>;
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>Settings</h1>
        <div className="settings-tabs">
          <button 
            className={`tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`}
            aria-pressed={activeTab === 'workspaces'}
            onClick={() => selectTab('workspaces')}
          >
            🔑 Workspaces
          </button>
          <button 
            className={`tab-btn ${activeTab === 'automation' ? 'active' : ''}`}
            aria-pressed={activeTab === 'automation'}
            onClick={() => selectTab('automation')}
          >
            ⚙️ Automation
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            aria-pressed={activeTab === 'logs'}
            onClick={() => selectTab('logs')}
          >
            📋 Logs
          </button>
        </div>
      </div>

      {activeTab === 'workspaces' && (
      <>
      <div className="settings-card slack-config">
        <h2>🔑 Slack workspaces <span className="workspace-count">{connections.length || tokens.length}</span></h2>
        
        {connectionError && <p className="error-message">Slack connection storage: {connectionError}</p>}
        {oauthMessage && <p className="connection-message" role="status">{oauthMessage}</p>}
        {(connections.length > 0 || tokens.length > 0) && (
          <div className="token-display">
            <div className="token-list">
              {connections.length > 0
                ? connections.map((connection, index) => (
                    <div key={connection.teamId || `unverified-${index}`} className="token-item">
                      <div className="workspace-details">
                        <div className="workspace-name">{connection.state === 'invalid'
                          ? 'Previous connection'
                          : connection.teamName || connection.teamId || 'Unknown workspace'}</div>
                        <div className="workspace-meta">
                          {connection.userName && <span>{connection.userName}</span>}
                          <span className={connection.state === 'auth-required' || connection.state === 'invalid' ||
                            connection.refreshIssue === 'temporary'
                            ? 'workspace-state needs-attention'
                            : 'workspace-state'}>
                            {connection.state === 'connected'
                              ? connection.refreshIssue === 'temporary'
                                ? 'Connection retrying'
                                : connection.canReconnect
                                  ? 'Connected'
                                  : 'Setup Link needed for first reconnect'
                              : connection.state === 'auth-required'
                                ? 'Reconnect required'
                                : connection.state === 'invalid'
                                  ? 'Token invalid · Use a Setup Link to reconnect'
                                  : 'Checking previous connection'}
                          </span>
                        </div>
                      </div>
                      {connection.teamId && <div className="workspace-actions">
                        {connection.canReconnect && (
                          <button className="secondary-action" onClick={() => void handleReconnect(connection.teamId!)}>Reconnect</button>
                        )}
                        <button className="subtle-action danger-action"
                          aria-label={`Remove ${connection.teamName || connection.teamId} locally`}
                          onClick={() => void handleRemoveWorkspace(connection.teamId!)}>Remove locally</button>
                      </div>}
                    </div>
                  ))
                : tokens.map((token, index) => (
                    <div key={index} className="token-item"><code>{token}</code></div>
                  ))}
            </div>
            {!showDeleteConfirm ? (
              <button className="delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                Remove all connections
              </button>
            ) : (
              <div className="delete-confirm">
                <p>Remove all Slack connections from this device?</p>
                <div className="confirm-buttons">
                  <button className="confirm-delete-btn" onClick={handleDeleteTokens}>
                    Remove all
                  </button>
                  <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="form-group setup-link-section">
          <label htmlFor="setup-link">Setup Link</label>
          <div className="setup-link-controls">
            <input id="setup-link" className="input-field" value={setupLink}
              onChange={event => setSetupLink(event.target.value)}
              placeholder="Paste a Setup Link" />
            <button className="save-btn" disabled={!setupLink.trim()}
              onClick={() => void handleOpenSetupLink()}>Connect workspace</button>
          </div>
          {error && <div className="error-message">{error}</div>}
          {saved && <div className="success-message">✓ Connections updated</div>}
          <button className="setup-link-toggle" aria-expanded={showLinkGenerator}
            onClick={() => setShowLinkGenerator(value => !value)}>Create Setup Link</button>
          {showLinkGenerator && <div className="setup-link-generator">
            <div className="setup-link-fields">
              <div>
                <label htmlFor="client-id">Slack Client ID</label>
                <input id="client-id" className="input-field" value={clientId}
                  onChange={event => setClientId(event.target.value)} />
              </div>
              <div>
                <label htmlFor="workspace-id">Workspace ID</label>
                <input id="workspace-id" className="input-field" value={workspaceId}
                  onChange={event => setWorkspaceId(event.target.value)} placeholder="Optional · starts with T" />
              </div>
            </div>
            <small className="help-text">In the Slack app, enable PKCE, add redirect URL
              <code> slack-status-bot://oauth</code>, and grant user scopes
              <code> users.profile:read, users.profile:write, users:write, dnd:write</code>.
              The Workspace ID restricts this link to one workspace.</small>
            <button className="secondary-action" onClick={handleGenerateLink}>Generate link</button>
            {generatedLink && <div className="setup-link-output">
              <label htmlFor="generated-setup-link">Generated Setup Link</label>
              <div className="setup-link-controls">
                <input id="generated-setup-link" className="input-field" readOnly value={generatedLink} />
                <button className="secondary-action" onClick={() => void navigator.clipboard.writeText(generatedLink)
                  .catch(() => setError('Copy failed; select the link above instead'))}>Copy link</button>
              </div>
            </div>}
          </div>}
        </div>
      </div>
      </>
      )}

      {activeTab === 'automation' && (
      <>
      {error && <div className="error-message" role="alert">{error}</div>}
      <div className="settings-card appearance-setting">
        <h2>🌓 Appearance</h2>
        <label htmlFor="theme-preference">Theme</label>
        <select id="theme-preference" value={themePreference} onChange={event => {
          const preference = event.target.value as ThemePreference;
          setThemePreference(preference);
          applyThemePreference(preference);
        }}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="settings-card">
        <h2>Meetings</h2>
        <label>
          <input type="checkbox" checked={meetingDnd} disabled={meetingDndSaving} onChange={async event => {
            const enabled = event.target.checked;
            setMeetingDndSaving(true);
            setError('');
            if (await IPCService.setMeetingDnd(enabled)) setMeetingDnd(enabled);
            else setError('Could not save meeting preference. Please try again.');
            setMeetingDndSaving(false);
          }} />
          {' '}Automatically enable Do Not Disturb during meetings
        </label>
      </div>
      <div className="settings-card">
        <h2>🎵 Source Priority</h2>
        <p className="priority-info">
          Drag sources to choose which status wins when several are active.
        </p>
        <div className="source-priority-list">
          {sourceOrder.map((source) => (
            <div
              key={source}
              className={`priority-item ${draggedSource === source ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(source)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(source)}
            >
              <span className="drag-handle">⋮⋮</span>
              <span className={`source-emoji ${source === 'spotify' || source === 'appleMusic' ? 'music-source-icon' : ''}`}>{sourceLabels[source]?.emoji}</span>
              <span className="source-name">{sourceLabels[source]?.name}</span>
            </div>
          ))}
        </div>
        <button className="save-btn" onClick={handleSaveSourceOrder}>
          💾 Save Priority
        </button>
      </div>

      <div className="settings-card">
        <h2>📝 Status Configuration</h2>
        <StatusConfigEditor />
      </div>

        <div className="settings-card">
          <h2>🚀 Startup</h2>
          <div className="system-setting">
            <label htmlFor="auto-launch" className="setting-label">
              <input 
                id="auto-launch"
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
                disabled={autoLaunchLoading}
                className="checkbox-input"
              />
              <span className="checkbox-text">Start App when computer boots</span>
            </label>
          </div>
        </div>
        <p className="settings-about">Slack Status Bot{appVersion ? ` v${appVersion}` : ''} · <a href="mailto:slackbot@wihel.de">Support</a></p>
        </>
      )}

      {activeTab === 'logs' && (
        <>
        <div className="settings-card">
          <h2>🔍 Log Level</h2>
          <div className="log-level-selector">
            <div className="log-levels">
              <button 
                className={`log-level-btn ${logLevel === 'DEBUG' ? 'active' : ''}`}
                onClick={() => handleLogLevelChange('DEBUG')}
                disabled={logLevelSaving}
              >
                🔧 DEBUG
                <small>Show all messages</small>
              </button>
              <button 
                className={`log-level-btn ${logLevel === 'INFO' ? 'active' : ''}`}
                onClick={() => handleLogLevelChange('INFO')}
                disabled={logLevelSaving}
              >
                ℹ️ INFO
                <small>Normal operations</small>
              </button>
              <button 
                className={`log-level-btn ${logLevel === 'WARN' ? 'active' : ''}`}
                onClick={() => handleLogLevelChange('WARN')}
                disabled={logLevelSaving}
              >
                ⚠️ WARN
                <small>Warnings & errors only</small>
              </button>
              <button 
                className={`log-level-btn ${logLevel === 'ERROR' ? 'active' : ''}`}
                onClick={() => handleLogLevelChange('ERROR')}
                disabled={logLevelSaving}
              >
                ❌ ERROR
                <small>Errors only (default)</small>
              </button>
            </div>
          </div>
        </div>

        <div className="settings-card logs-card">
          <LogViewer />
        </div>
        </>
      )}
    </div>
  );
};

export default Settings;
