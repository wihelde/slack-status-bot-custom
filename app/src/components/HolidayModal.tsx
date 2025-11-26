import React, { useState, useMemo } from 'react';
import '../styles/HolidayModal.css';

interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSetHoliday: (returnDate: string) => Promise<void>;
}

const HolidayModal: React.FC<HolidayModalProps> = ({ isOpen, onClose, onSetHoliday }) => {
  const [returnDate, setReturnDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calculate preview text showing when they'll be back
  const previewText = useMemo(() => {
    if (!returnDate) return '';
    
    try {
      const [day, month, year] = returnDate.split('.').map(Number);
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
      
      return `On vacation (back on ${backDateStr})`;
    } catch (err) {
      return '';
    }
  }, [returnDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!returnDate) {
      setError('Please select a return date');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await onSetHoliday(returnDate);
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏖️ Set Holiday Status</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="returnDate">Return Date (DD.MM.YYYY)</label>
            <input
              id="returnDate"
              type="text"
              placeholder="e.g., 28.11.2025"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="date-input"
              maxLength={10}
              disabled={loading}
            />
            <small className="help-text">
              Enter the date when you'll be back. If it's a Friday, the status will expire on Monday.
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

