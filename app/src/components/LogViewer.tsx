import React, { useState, useEffect, useRef } from 'react';
import { IPCService } from '../services/ipcService';
import '../styles/LogViewer.css';

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<string>('Loading logs...');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true); // Auto-scroll to bottom
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

  // Scroll to bottom when logs change (if autoScroll is enabled)
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [logs, autoScroll]);

  // Detect if user scrolls away from bottom (disable auto-scroll)
  const handleScroll = () => {
    if (!logContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // Within 50px of bottom
    
    // Only update if value changed to avoid re-renders
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  };

  const loadLogs = async () => {
    try {
      const logContent = await IPCService.getLogs(300);
      setLogs(logContent);
      setLoading(false);
    } catch (error) {
      setLogs(`Error loading logs: ${error}`);
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    alert('Logs copied to clipboard!');
  };

  const handleClearLogs = async () => {
    const confirmed = window.confirm('Are you sure you want to clear all logs? This cannot be undone.');
    if (confirmed) {
      const success = await IPCService.clearLogs();
      if (success) {
        setLogs('(Logs cleared)');
        setTimeout(() => {
          setLogs('');
        }, 1500);
      } else {
        alert('Error clearing logs');
      }
    }
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
        <button 
          className="clear-btn" 
          onClick={handleClearLogs}
        >
          🗑️ Clear Logs
        </button>
      </div>

      <div 
        ref={logContainerRef}
        className="log-container"
        onScroll={handleScroll}
      >
        {logs ? (
          <pre className="log-content">{logs}</pre>
        ) : (
          <div className="no-logs">No logs to display</div>
        )}
        
        {/* Show scroll-to-bottom button when not at bottom */}
        {!autoScroll && (
          <button 
            className="scroll-to-bottom-btn"
            onClick={scrollToBottom}
            title="Scroll to bottom"
          >
            ↓ New logs
          </button>
        )}
      </div>

      <footer className="log-info">
        <span>Log file: <code>~/.config/slack-status-bot/logs/app.log</code></span>
        <span>Last 300 lines · rotates at 10 MB</span>
      </footer>
    </div>
  );
};

export default LogViewer;
