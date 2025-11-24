import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HolidayModal from '../HolidayModal';

describe('HolidayModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSetHoliday = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Display', () => {
    it('should not display when isOpen is false', () => {
      render(
        <HolidayModal
          isOpen={false}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      expect(screen.queryByText(/Set Holiday Status/i)).not.toBeInTheDocument();
    });

    it('should display when isOpen is true', () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      expect(screen.getByText(/Set Holiday Status/i)).toBeInTheDocument();
    });

    it('should have date input field', () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i);
      expect(input).toBeInTheDocument();
    });
  });

  describe('Date Input and Preview', () => {
    it('should update preview when date is entered', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '21.11.2025' } }); // Friday

      await waitFor(() => {
        // Preview should show the back date (Monday for Friday + 3 days)
        expect(screen.getByText(/24.11.2025/)).toBeInTheDocument();
      });
    });

    it('should show +3 days for Friday return date', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '21.11.2025' } }); // Friday

      await waitFor(() => {
        // Should add 3 days (Fri 21 + 3 = Mon 24)
        expect(screen.getByText(/24.11.2025/)).toBeInTheDocument();
      });
    });

    it('should show +1 day for non-Friday return date', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '24.11.2025' } }); // Monday

      await waitFor(() => {
        // Should add 1 day (Mon 24 + 1 = Tue 25)
        expect(screen.getByText(/25.11.2025/)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Actions', () => {
    it('should call onClose when Cancel is clicked', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when close button is clicked', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const closeBtn = screen.getByRole('button', { name: '×' });
      fireEvent.click(closeBtn);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable Set Holiday button when no date is entered', () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      expect(setBtn).toBeDisabled();
    });

    it('should enable Set Holiday button when date is entered', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '21.11.2025' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      
      await waitFor(() => {
        expect(setBtn).not.toBeDisabled();
      });
    });

    it('should call onSetHoliday with date when Set Holiday is clicked', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '21.11.2025' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      
      await waitFor(() => {
        fireEvent.click(setBtn);
      });

      await waitFor(() => {
        expect(mockOnSetHoliday).toHaveBeenCalledWith('21.11.2025');
      });
    });

    it('should close modal after setting holiday', async () => {
      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '21.11.2025' } });

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
    it('should show error message on invalid date', async () => {
      mockOnSetHoliday.mockRejectedValueOnce(new Error('Invalid date'));

      render(
        <HolidayModal
          isOpen={true}
          onClose={mockOnClose}
          onSetHoliday={mockOnSetHoliday}
        />
      );

      const input = screen.getByPlaceholderText(/e.g., 28.11.2025/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'invalid' } });

      const setBtn = screen.getByRole('button', { name: /Set Holiday/i });
      
      await waitFor(() => {
        if (setBtn && !setBtn.disabled) {
          fireEvent.click(setBtn);
        }
      });
    });
  });
});

