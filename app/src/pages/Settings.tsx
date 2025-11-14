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
        <h2>🎵 Sources</h2>
        <div className="settings-list">
          <div className="setting-item">
            <div className="setting-header">
              <label>Spotify Integration</label>
            </div>
            <small>🎵 Track your currently playing Spotify song</small>
            <p className="setting-note">Requires Spotify app running on macOS</p>
          </div>

          <div className="setting-item">
            <div className="setting-header">
              <label>Apple Music Integration</label>
            </div>
            <small>🎶 Track your currently playing Apple Music song</small>
            <p className="setting-note">Requires Music app on macOS</p>
          </div>

          <div className="setting-item">
            <div className="setting-header">
              <label>Zoom Detection</label>
            </div>
            <small>📹 Auto-detect and update status during Zoom calls</small>
            <p className="setting-note">Works on macOS and Windows</p>
          </div>

          <div className="setting-item">
            <div className="setting-header">
              <label>Microsoft Teams Detection</label>
            </div>
            <small>👥 Auto-detect and update status during Teams calls</small>
            <p className="setting-note">Works on macOS and Windows</p>
          </div>

          <div className="setting-item">
            <div className="setting-header">
              <label>Slack Huddle Detection</label>
            </div>
            <small>🎧 Auto-detect and update status during Slack huddles</small>
            <p className="setting-note">Works on macOS and Windows</p>
          </div>
        </div>
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
