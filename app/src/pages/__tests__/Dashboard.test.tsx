import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { IPCService } from '../../services/ipcService';

// Mock IPCService
vi.mock('../../services/ipcService');

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock IPCService methods
    const mockIPCService = IPCService as any;
    mockIPCService.getSlackStatus = vi.fn().mockResolvedValue({
      emoji: ':spotify_2:',
      text: 'Playing Music',
      stateCheckValue: 'spotify',
    });
    mockIPCService.getDaemonStatus = vi.fn().mockResolvedValue({
      running: true,
    });
    mockIPCService.getSourceStatuses = vi.fn().mockResolvedValue({
      spotify: { isActive: true, message: 'Playing Music' },
      appleMusic: { isActive: false },
      zoom: { isActive: false },
      teams: { isActive: false },
      huddle: { isActive: false },
    });
  });

  describe('Status Update Interval', () => {
    it('should load status on mount', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        expect(IPCService.getSlackStatus).toHaveBeenCalled();
      });
    });

    it('should update status every 60 seconds', async () => {
      vi.useFakeTimers();
      
      render(<Dashboard />);
      
      // Initial load
      expect(IPCService.getSlackStatus).toHaveBeenCalledTimes(1);
      
      // Advance 60 seconds
      vi.advanceTimersByTime(60000);
      
      await waitFor(() => {
        expect(IPCService.getSlackStatus).toHaveBeenCalledTimes(2);
      });
      
      vi.useRealTimers();
    });

    it('should display current status', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        // Status should be displayed somewhere
        expect(screen.getByText(/Slack Status Bot/i)).toBeInTheDocument();
      });
    });
  });

  describe('Source Display', () => {
    it('should display all sources', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        expect(IPCService.getSourceStatuses).toHaveBeenCalled();
      });
    });
  });

  describe('Quick Actions', () => {
    it('should have Holiday quick action', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        const holidayBtn = screen.getByRole('button', { name: /holiday/i });
        expect(holidayBtn).toBeInTheDocument();
      });
    });

    it('should have Online and Away buttons', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /online/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /away/i })).toBeInTheDocument();
      });
    });
  });

  describe('Daemon Status Display', () => {
    it('should show daemon running status', async () => {
      render(<Dashboard />);
      
      await waitFor(() => {
        expect(screen.getByText(/running/i)).toBeInTheDocument();
      });
    });
  });
});



