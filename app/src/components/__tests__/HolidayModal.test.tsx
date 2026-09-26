import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HolidayModal from '../HolidayModal';

describe('HolidayModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSetHoliday = vi.fn().mockResolvedValue(undefined);

  const renderModal = (isOpen = true) => {
    render(
      <HolidayModal
        isOpen={isOpen}
        onClose={mockOnClose}
        onSetHoliday={mockOnSetHoliday}
      />
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Display', () => {
    it('should not display when isOpen is false', () => {
      renderModal(false);
      expect(screen.queryByText(/Set Holiday Status/i)).not.toBeInTheDocument();
    });

    it('should display when isOpen is true', () => {
      renderModal();
      expect(screen.getByText(/Set Holiday Status/i)).toBeInTheDocument();
    });

    it('should have date input field', () => {
      renderModal();
      expect(screen.getByLabelText('Last holiday date')).toHaveAttribute('type', 'date');
    });
  });

  describe('Date Input and Preview', () => {
    it('should update preview when date is entered', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } }); // Friday

      await waitFor(() => {
        expect(screen.getByText(/24.11.2025/)).toBeInTheDocument();
      });
    });

    it('should show +3 days for Friday return date', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } }); // Friday

      await waitFor(() => {
        expect(screen.getByText(/24.11.2025/)).toBeInTheDocument();
      });
    });

    it('should show +1 day for non-Friday return date', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-24' } }); // Monday

      await waitFor(() => {
        expect(screen.getByText(/25.11.2025/)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Actions', () => {
    it('should call onClose when Cancel is clicked', async () => {
      renderModal();
      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when close button is clicked', async () => {
      renderModal();
      const closeBtn = screen.getByRole('button', { name: 'Close holiday dialog' });
      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable Set Holiday button when no date is entered', () => {
      renderModal();
      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      expect(setBtn).toBeDisabled();
    });

    it('should enable Set Holiday button when date is entered', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      await waitFor(() => {
        expect(setBtn).not.toBeDisabled();
      });
    });

    it('should call onSetHoliday with date when Set Holiday is clicked', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      await waitFor(() => {
        fireEvent.click(setBtn);
      });

      await waitFor(() => {
        expect(mockOnSetHoliday).toHaveBeenCalledWith('21.11.2025');
      });
    });

    it('should close modal after setting holiday', async () => {
      renderModal();
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      await waitFor(() => {
        fireEvent.click(setBtn);
      });

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show an error when setting the selected date fails', async () => {
      mockOnSetHoliday.mockRejectedValueOnce(new Error('Invalid date'));
      renderModal();
      
      const input = screen.getByLabelText('Last holiday date') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2025-11-21' } });
      fireEvent.click(screen.getByRole('button', { name: /Set Holiday/i }));
      expect(await screen.findByText('Invalid date')).toBeInTheDocument();
    });
  });
});



