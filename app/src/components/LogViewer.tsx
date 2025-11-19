import React, { useState, useEffect, useRef } from 'react';
import { IPCService } from '../services/ipcService';
import '../styles/LogViewer.css';

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<string>('Loading logs...');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogs();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const loadLogs = async () => {
    try {
      const logContent = await IPCService.getLogs(300);
      setLogs(logContent);
      setLoading(false);

      // Auto-scroll to bottom if auto-refresh is enabled
      if (autoRefresh && logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    } catch (error) {
      setLogs(`Error loading logs: ${error}`);
      setLoading(false);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    alert('Logs copied to clipboard!');
  };

  const handleClearLogs = () => {
    setLogs('');
  };

  return (
    <div className="log-viewer">
      <div className="log-controls">
        <button 
          className="refresh-btn" 
          onClick={loadLogs}
          disabled={loading}
        >
          🔄 Refresh
        </button>
        <label className="auto-refresh-label">
          <input 
            type="checkbox" 
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-Refresh (2s)
        </label>
        <button 
          className="copy-btn" 
          onClick={handleCopyLogs}
        >
          📋 Copy Logs
        </button>
      </div>

      <div 
        ref={logContainerRef}
        className="log-container"
      >
        {logs ? (
          <pre className="log-content">{logs}</pre>
        ) : (
          <div className="no-logs">No logs to display</div>
        )}
      </div>

      <div className="log-info">
        <small>
          📁 Logs saved to: ~/.config/slack-status-bot/logs/app.log
          <br />
          Showing last 300 lines • Auto-rotates at 10MB
        </small>
      </div>
    </div>
  );
};

export default LogViewer;

