import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';
import { IPCService } from '../services/ipcService';

const Settings: React.FC = () => {
  const [slackToken, setSlackToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sourceOrder, setSourceOrder] = useState<string[]>(['spotify', 'appleMusic', 'zoom', 'teams', 'huddle']);
  const [draggedSource, setDraggedSource] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      console.log('[Settings] Loading tokens...');
      const tokenData = await IPCService.getTokens();
      console.log('[Settings] Token data received:', tokenData);
      if (tokenData) {
        console.log('[Settings] Setting tokens:', tokenData.tokens);
        setTokens(tokenData.tokens || []);
      }

      // Load source order
      const order = await IPCService.getSourceOrder();
      if (order) {
        console.log('[Settings] Source order loaded:', order);
        setSourceOrder(order);
      }

      setLoading(false);
    } catch (err) {
      console.error('[Settings] Error loading config:', err);
      setLoading(false);
    }
  };

  const handleSaveTokens = async () => {
    if (!slackToken.trim()) {
      setError('Please enter a Slack token');
      return;
    }

    try {
      setError('');
      setSaved(false);
      const newTokens = slackToken.includes(',')
        ? slackToken.split(',').map(t => t.trim())
        : [slackToken.trim()];

      const success = await IPCService.saveTokens(newTokens);
      if (success) {
        setSaved(true);
        setSlackToken('');
        // Reload tokens after saving
        await loadConfig();
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save tokens');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving tokens');
    }
  };

  const handleDeleteTokens = async () => {
    try {
      setError('');
      const success = await IPCService.deleteTokens();
      if (success) {
        setTokens([]);
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

  const handleDragStart = (source: string) => {
    setDraggedSource(source);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetSource: string) => {
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

  const sourceLabels: Record<string, { name: string; emoji: string }> = {
    spotify: { name: 'Spotify', emoji: '🎵' },
    appleMusic: { name: 'Apple Music', emoji: '🎶' },
    zoom: { name: 'Zoom', emoji: '📹' },
    teams: { name: 'Microsoft Teams', emoji: '👥' },
    huddle: { name: 'Slack Huddle', emoji: '🎧' },
  };

  if (loading) {
    return <div className="settings"><p>Loading...</p></div>;
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-card">
        <h2>🔑 Slack Configuration</h2>
        
        {tokens.length > 0 && (
          <div className="token-display">
            <h3>Configured Tokens ({tokens.length})</h3>
            <div className="token-list">
              {tokens.map((token, index) => (
                <div key={index} className="token-item">
                  <code>{token}</code>
                </div>
              ))}
            </div>
            {!showDeleteConfirm ? (
              <button className="delete-btn" onClick={() => setShowDeleteConfirm(true)}>
                🗑️ Delete All Tokens
              </button>
            ) : (
              <div className="delete-confirm">
                <p>Are you sure? This will stop the daemon from running.</p>
                <div className="confirm-buttons">
                  <button className="confirm-delete-btn" onClick={handleDeleteTokens}>
                    Yes, Delete
                  </button>
                  <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="form-group">
          <label htmlFor="token">Add Slack Bot Token(s)</label>
          <textarea
            id="token"
            placeholder="Enter your Slack bot token (xoxb-...)"
            value={slackToken}
            onChange={(e) => setSlackToken(e.target.value)}
            className="input-field"
            rows={3}
          />
          <small className="help-text">
            📖 Get your token from{' '}
            <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
              Slack App Settings
            </a>
            . You can add multiple tokens separated by commas.
          </small>
          {error && <div className="error-message">{error}</div>}
          <button className="save-btn" onClick={handleSaveTokens}>
            💾 Save Token
          </button>
          {saved && <div className="success-message">✓ Token saved successfully</div>}
        </div>
      </div>

      <div className="settings-card">
        <h2>🎵 Source Priority (Drag to Reorder)</h2>
        <p className="priority-info">
          When multiple sources are active, the one appearing first in this list will be displayed. 
          Drag and drop to set your priority.
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
              <span className="source-emoji">{sourceLabels[source]?.emoji}</span>
              <span className="source-name">{sourceLabels[source]?.name}</span>
            </div>
          ))}
        </div>
        <button className="save-btn" onClick={handleSaveSourceOrder}>
          💾 Save Priority
        </button>
      </div>

      <div className="settings-card">
        <h2>ℹ️ About</h2>
        <div className="about-section">
          <p><strong>Slack Status Bot v1.0.0</strong></p>
          <p>Automatically update your Slack status based on what you're doing:</p>
          <ul>
            <li>🎵 Music: Spotify and Apple Music</li>
            <li>📞 Meetings: Zoom, Teams, and Slack Huddles</li>
            <li>🗓️ Day-based: Monday morning, Friday vibes, weekends</li>
            <li>⏰ Auto-correction: Resumes normal status when activities end</li>
          </ul>
          <p>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            {' '} | {' '}
            <a href="mailto:support@example.com">
              Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
