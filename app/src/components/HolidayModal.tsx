import React, { useState, useMemo, useEffect } from 'react';
import '../styles/HolidayModal.css';
import { CustomStatusConfig } from '../config/statusConfig';
import { IPCService } from '../services/ipcService';

interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetHoliday: (returnDate: string) => Promise<void>;
}

const HolidayModal: React.FC<HolidayModalProps> = ({ isOpen, onClose, onSetHoliday }) => {
  const [returnDate, setReturnDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [holidayConfig, setHolidayConfig] = useState<CustomStatusConfig | null>(null);

  // Load the holiday configuration on component mount
  useEffect(() => {
    const loadHolidayConfig = async () => {
      try {
        const config = await IPCService.getStatusConfiguration();
        if (config) {
          const holiday = config.find((s: CustomStatusConfig) => s.id === 'holiday');
          setHolidayConfig(holiday || null);
        }
      } catch (err) {
        console.error('Failed to load holiday config:', err);
      }
    };

    if (isOpen) {
      loadHolidayConfig();
    }
  }, [isOpen]);

  // Calculate preview text showing when they'll be back
  const previewText = useMemo(() => {
    if (!returnDate) return '';
    
    try {
      const [year, month, day] = returnDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      
      // Get day of week (0 = Sunday, 5 = Friday, 6 = Saturday)
      const dayOfWeekNum = date.getDay();
      
      let addDays = 1;
      // Check if it's Friday (5), Saturday (6), or Sunday (0)
      if (dayOfWeekNum === 5) { // Friday
        addDays = 3; // Monday
      } else if (dayOfWeekNum === 6) { // Saturday
        addDays = 2; // Monday
      } else if (dayOfWeekNum === 0) { // Sunday
        addDays = 1; // Monday
      }
      
      const backDate = new Date(date);
      backDate.setDate(backDate.getDate() + addDays);
      
      // Format date as DD.MM.YYYY
      const backDay = String(backDate.getDate()).padStart(2, '0');
      const backMonth = String(backDate.getMonth() + 1).padStart(2, '0');
      const backYear = backDate.getFullYear();
      const backDateStr = `${backDay}.${backMonth}.${backYear}`;
      
      // Use the configured holiday message or default
      const holidayMessage = holidayConfig?.message || 'strong vacationing';
      return `${holidayMessage} (back on ${backDateStr})`;
    } catch (err) {
      return '';
    }
  }, [returnDate, holidayConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!returnDate) {
      setError('Please select a return date');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const [year, month, day] = returnDate.split('-');
      await onSetHoliday(`${day}.${month}.${year}`);
      setReturnDate('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set holiday status');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="holiday-dialog-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="holiday-dialog-title">🏖️ Set Holiday Status</h2>
          <button className="modal-close" aria-label="Close holiday dialog" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="returnDate">Last holiday date</label>
            <input
              id="returnDate"
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="date-input"
              disabled={loading}
            />
            <small className="help-text">
              The status expires after this date.
            </small>
          </div>

          {previewText && (
            <div className="preview">
              <div className="preview-label">Preview:</div>
              <div className="preview-text">
                <span className="emoji">🏖️</span>
                <span>{previewText}</span>
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn set-btn"
              disabled={loading || !returnDate}
            >
              {loading ? 'Setting...' : 'Set Holiday'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HolidayModal;
