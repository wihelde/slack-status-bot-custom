import React, { useState, useEffect } from 'react';
import { CustomStatusConfig, DayOfWeek, getDefaultStatusConfiguration } from '../config/statusConfig';
import { IPCService } from '../services/ipcService';
import '../styles/StatusConfigEditor.css';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ValidationError {
  field: string;
  message: string;
}

export const StatusConfigEditor: React.FC = () => {
  const [statuses, setStatuses] = useState<CustomStatusConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load status configuration on mount
  useEffect(() => {
    loadStatusConfiguration();
  }, []);

  const loadStatusConfiguration = async () => {
    try {
      setLoading(true);
      const config = await IPCService.getStatusConfiguration();
      if (config) {
        setStatuses(config);
      } else {
        // Fallback to defaults
        setStatuses(getDefaultStatusConfiguration());
      }
    } catch (error) {
      console.error('Error loading status configuration:', error);
      setStatuses(getDefaultStatusConfiguration());
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (index: number, updatedStatus: CustomStatusConfig) => {
    const newStatuses = [...statuses];
    newStatuses[index] = updatedStatus;
    setStatuses(newStatuses);
  };

  const handleCopyStatus = (index: number) => {
    const originalStatus = statuses[index];
    const copiedStatus: CustomStatusConfig = {
      ...originalStatus,
      id: `${originalStatus.id}_copy_${Date.now()}`,
      message: `${originalStatus.message} (Copy)`,
      quickActionLabel: null,
      category: 'day_based',
    };
    setStatuses([...statuses, copiedStatus]);
    setSuccessMessage(`Status "${originalStatus.message}" copied!`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDeleteStatus = (index: number) => {
    const status = statuses[index];
    // Only allow deleting day-based statuses
    if (status.category === 'quick_action') {
      setValidationError('Cannot delete Quick Actions');
      return;
    }
    const newStatuses = statuses.filter((_, i) => i !== index);
    setStatuses(newStatuses);
    setSuccessMessage(`Status "${status.message}" deleted!`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleAddNewStatus = () => {
    const newStatus: CustomStatusConfig = {
      id: `custom_${Date.now()}`,
      emoji: ':smile:',
      message: 'New status',
      days: [],
      enableDND: false,
      presence: 'auto',
      quickActionLabel: null,
      category: 'day_based',
    };
    setStatuses([...statuses, newStatus]);
  };

  // Validation functions
  const isDuplicate = (status: CustomStatusConfig, allStatuses: CustomStatusConfig[]): boolean => {
    return allStatuses.some(s =>
      s.id !== status.id &&
      s.emoji === status.emoji &&
      s.message === status.message &&
      arraysEqual(s.days, status.days) &&
      s.enableDND === status.enableDND &&
      s.presence === status.presence
    );
  };

  const arraysEqual = (a: DayOfWeek[], b: DayOfWeek[]): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  };

  const validateStatuses = (statusesToValidate: CustomStatusConfig[]): string | null => {
    for (const status of statusesToValidate) {
      // Check for exact duplicates
      if (isDuplicate(status, statusesToValidate)) {
        return `Duplicate status found: "${status.message}". Please change at least one property (emoji, message, days, DND, or presence).`;
      }

      // Check for unmodified copied statuses (e.g., "message (Copy)" that hasn't been changed)
      if (status.message.includes('(Copy)')) {
        const baseMessage = status.message.replace(' (Copy)', '');
        const hasUnmodifiedCopy = statusesToValidate.some(s =>
          s.id !== status.id &&
          s.emoji === status.emoji &&
          s.message === baseMessage &&
          arraysEqual(s.days, status.days) &&
          s.enableDND === status.enableDND &&
          s.presence === status.presence
        );

        if (hasUnmodifiedCopy) {
          return `The copied status "${status.message}" hasn't been modified. Please change the emoji, message, days, DND, or presence to make it unique.`;
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    try {
      // Validate before saving
      const error = validateStatuses(statuses);
      if (error) {
        setValidationError(error);
        setSuccessMessage(null);
        return;
      }

      setSaving(true);
      setValidationError(null);
      const success = await IPCService.updateStatusConfiguration(statuses);

      if (success) {
        setSuccessMessage('Status configuration saved successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setValidationError('Failed to save status configuration');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setValidationError(`Error saving configuration: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset to defaults? This will overwrite all your custom changes.')) {
      return;
    }

    try {
      setSaving(true);
      setValidationError(null);
      const success = await IPCService.resetStatusConfiguration();

      if (success) {
        const defaultConfig = getDefaultStatusConfiguration();
        setStatuses(defaultConfig);
        setSuccessMessage('Status configuration reset to defaults!');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setValidationError('Failed to reset status configuration');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setValidationError(`Error resetting configuration: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete all scheduled statuses? Quick Actions will be preserved.')) {
      return;
    }

    try {
      setSaving(true);
      setValidationError(null);
      // Keep only quick actions, remove all day-based statuses
      const quickActionsOnly = statuses.filter(s => s.category === 'quick_action');
      const success = await IPCService.updateStatusConfiguration(quickActionsOnly);

      if (success) {
        setStatuses(quickActionsOnly);
        setSuccessMessage('All scheduled statuses deleted! Quick Actions preserved.');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setValidationError('Failed to delete statuses');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setValidationError(`Error deleting statuses: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="status-config-editor loading">Loading status configuration...</div>;
  }

  // Group statuses by category
  const quickActions = statuses.filter(s => s.category === 'quick_action');
  const dayBased = statuses.filter(s => s.category === 'day_based');

  return (
    <div className="status-config-editor">
      <div className="editor-container">
        {/* Quick Actions Section */}
        <section className="status-section">
          <h3>Quick Actions</h3>
          <p className="section-description">
            These status options appear as buttons on the Dashboard. Edit the emoji and message to customize them.
          </p>

          <div className="statuses-list">
            {quickActions.map((status, index) => {
              const actualIndex = statuses.findIndex(s => s.id === status.id);
              return (
                <StatusItem
                  key={status.id}
                  status={status}
                  index={actualIndex}
                  isQuickAction={true}
                  onStatusChange={handleStatusChange}
                  onCopy={handleCopyStatus}
                  onDelete={handleDeleteStatus}
                />
              );
            })}
          </div>
        </section>

        {/* Day-based Status Section */}
        <section className="status-section">
          <div className="section-header">
            <h3>Scheduled Status (by Day of Week)</h3>
            <button className="btn btn-secondary" onClick={handleAddNewStatus}>
              + Add New Status
            </button>
          </div>
          <p className="section-description">
            Set automatic status updates for specific days of the week. If multiple statuses are configured for the same day, one will be randomly selected.
          </p>

          <div className="statuses-list">
            {dayBased.length === 0 ? (
              <p className="no-statuses">No day-based statuses configured. Click "Add New Status" to create one.</p>
            ) : (
              dayBased.map((status, index) => {
                const actualIndex = statuses.findIndex(s => s.id === status.id);
                return (
                  <StatusItem
                    key={status.id}
                    status={status}
                    index={actualIndex}
                    isQuickAction={false}
                    onStatusChange={handleStatusChange}
                    onCopy={handleCopyStatus}
                    onDelete={handleDeleteStatus}
                  />
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="editor-footer">
        <div className="footer-left">
          <button className="btn btn-outline-danger" onClick={handleDeleteAll} disabled={saving} title="Delete all scheduled statuses, keep Quick Actions">
            🗑️ Delete All Scheduled
          </button>
          <button className="btn btn-danger" onClick={handleReset} disabled={saving}>
            Reset to Defaults
          </button>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {successMessage && <div className="success-message">{successMessage}</div>}
      {validationError && <div className="error-message">{validationError}</div>}
    </div>
  );
};

interface StatusItemProps {
  status: CustomStatusConfig;
  index: number;
  isQuickAction: boolean;
  onStatusChange: (index: number, status: CustomStatusConfig) => void;
  onCopy: (index: number) => void;
  onDelete: (index: number) => void;
}

const StatusItem: React.FC<StatusItemProps> = ({
  status,
  index,
  isQuickAction,
  onStatusChange,
  onCopy,
  onDelete,
}) => {
  const handleEmojiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onStatusChange(index, { ...status, emoji: e.target.value });
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onStatusChange(index, { ...status, message: e.target.value });
  };

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = status.days.includes(day)
      ? status.days.filter(d => d !== day)
      : [...status.days, day];
    onStatusChange(index, { ...status, days: newDays });
  };

  const handleDNDToggle = () => {
    onStatusChange(index, { ...status, enableDND: !status.enableDND });
  };

  const handlePresenceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onStatusChange(index, { ...status, presence: e.target.value as 'auto' | 'away' });
  };

  return (
    <div className="status-item">
      <div className="status-content">
        <div className="form-group">
          <label>Emoji</label>
          <input
            type="text"
            placeholder=":smile:"
            value={status.emoji}
            onChange={handleEmojiChange}
            className="form-input emoji-input"
            title="Slack emoji code, e.g., :smile: or :fire:"
          />
        </div>

        <div className="form-group">
          <label>Message</label>
          <textarea
            value={status.message}
            onChange={handleMessageChange}
            className="form-input message-input"
            rows={2}
            placeholder="Your status message"
          />
        </div>

        <div className="form-group">
          <label>Presence</label>
          <select value={status.presence} onChange={handlePresenceChange} className="form-input">
            <option value="auto">Auto (online)</option>
            <option value="away">Away</option>
          </select>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={status.enableDND} onChange={handleDNDToggle} />
            <span>Enable Do Not Disturb (DND)</span>
          </label>
        </div>

        {!isQuickAction && (
          <div className="form-group">
            <label>Days of Week</label>
            <div className="days-checkboxes">
              {DAYS_OF_WEEK.map((day, dayIndex) => {
                // Reorder to show MON-SAT first, then SUN at the end
                // Map: SUN(0) -> end, MON(1)->0, TUE(2)->1, ... SAT(6)->5
                let displayOrder = dayIndex === 0 ? 6 : dayIndex - 1;
                return (
                  <label key={dayIndex} className="day-checkbox">
                    <input
                      type="checkbox"
                      checked={status.days.includes(dayIndex as DayOfWeek)}
                      onChange={() => handleDayToggle(dayIndex as DayOfWeek)}
                    />
                    <span>{day.substring(0, 3)}</span>
                  </label>
                );
              }).sort((a, b) => {
                const aIndex = parseInt(a.key || '0');
                const bIndex = parseInt(b.key || '0');
                const aOrder = aIndex === 0 ? 6 : aIndex - 1;
                const bOrder = bIndex === 0 ? 6 : bIndex - 1;
                return aOrder - bOrder;
              })}
            </div>
          </div>
        )}

        {isQuickAction && status.quickActionLabel && (
          <div className="form-group">
            <label>Quick Action Label (Read-only)</label>
            <input
              type="text"
              value={status.quickActionLabel}
              disabled
              className="form-input readonly"
            />
          </div>
        )}
      </div>

      <div className="status-actions">
        <button className="btn btn-small btn-secondary" onClick={() => onCopy(index)} title="Duplicate this status">
          📋 Copy
        </button>
        {!isQuickAction && (
          <button className="btn btn-small btn-danger" onClick={() => onDelete(index)} title="Delete this status">
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  );
};
