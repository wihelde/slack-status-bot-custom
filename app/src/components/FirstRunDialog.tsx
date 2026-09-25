import React, { useState } from 'react';
import { IPCService } from '../services/ipcService';
import '../styles/FirstRunDialog.css';

interface FirstRunDialogProps {
  onComplete: () => void;
}

const FirstRunDialog: React.FC<FirstRunDialogProps> = ({ onComplete }) => {
  const [setting, setSetting] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // Setze Auto-Launch basierend auf User-Auswahl (explizit auch false setzen!)
      await IPCService.setAutoLaunch(setting);
      // Markiere First Run als abgeschlossen
      await IPCService.completeFirstRun();
      onComplete();
    } catch (err) {
      console.error('Error in first run dialog:', err);
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="first-run-overlay">
      <div className="first-run-dialog">
        <div className="dialog-header">
          <h2>🚀 Welcome to Slack Status Bot</h2>
        </div>
        
        <div className="dialog-content">
          <p className="welcome-text">
            Choose whether Slack Status Bot starts with your Mac.
          </p>
          
          <div className="setup-option">
            <label className="setup-label">
              <input
                type="checkbox"
                checked={setting}
                onChange={(e) => setSetting(e.target.checked)}
                disabled={loading}
                className="setup-checkbox"
              />
              <span className="setup-text">
                Automatically start when I restart my computer
              </span>
            </label>
            <p className="setup-description">
              The app runs in the background to keep your status up to date.
            </p>
          </div>

          <div className="feature-list">
            <h3>Features:</h3>
            <ul>
              <li>🎵 Automatically update when you're listening to music</li>
              <li>📞 Set "In a meeting" when using Zoom, Teams, or Huddles</li>
              <li>🗓️ Day-based statuses for different weekdays</li>
              <li>⏰ Smart auto-correction when activities end</li>
            </ul>
          </div>
        </div>

        <div className="dialog-actions">
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Setting up...' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstRunDialog;
