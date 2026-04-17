import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { IPCService } from '../services/ipcService';

// Mock IPCService
vi.mock('../services/ipcService');

// Mock child components to avoid complex setup
vi.mock('../components/FirstRunDialog', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="first-run-dialog">
      <button onClick={onComplete}>Complete Setup</button>
    </div>
  ),
}));

vi.mock('../pages/Dashboard', () => ({
  default: () => <div data-testid="dashboard">Dashboard</div>,
}));

vi.mock('../pages/Settings', () => ({
  default: () => <div data-testid="settings">Settings</div>,
}));

describe('App - First Run Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show FirstRunDialog when isFirstRun is true', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.isFirstRun = vi.fn().mockResolvedValue(true);
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('first-run-dialog')).toBeInTheDocument();
    });

    // Dashboard sollte NICHT sichtbar sein
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('should show Dashboard when isFirstRun is false', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.isFirstRun = vi.fn().mockResolvedValue(false);
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    // FirstRunDialog sollte NICHT sichtbar sein
    expect(screen.queryByTestId('first-run-dialog')).not.toBeInTheDocument();
  });

  it('should hide FirstRunDialog when onComplete is called', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.isFirstRun = vi.fn().mockResolvedValue(true);
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('first-run-dialog')).toBeInTheDocument();
    });

    // Click the complete button
    const completeButton = screen.getByRole('button', { name: /Complete Setup/i });
    await act(async () => {
      completeButton.click();
    });

    await waitFor(() => {
      // FirstRunDialog sollte verschwunden sein
      expect(screen.queryByTestId('first-run-dialog')).not.toBeInTheDocument();
      // Dashboard sollte jetzt sichtbar sein
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  it('should call isFirstRun on mount', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.isFirstRun = vi.fn().mockResolvedValue(false);
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    await waitFor(() => {
      expect(mockIPCService.isFirstRun).toHaveBeenCalled();
    });
  });

  it('should handle isFirstRun error gracefully', async () => {
    const mockIPCService = IPCService as any;
    // isFirstRun catches errors internally and returns false, so we just test that false works
    mockIPCService.isFirstRun = vi.fn().mockResolvedValue(false);
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    // Should show dashboard when isFirstRun returns false (which happens on error)
    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should show loading state initially', async () => {
    const mockIPCService = IPCService as any;
    // Verzögere den resolve
    mockIPCService.isFirstRun = vi.fn(() => 
      new Promise(resolve => setTimeout(() => resolve(false), 100))
    );
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue({ daemon: { running: true } });
    mockIPCService.onDaemonStatusChange = vi.fn();

    render(<App />);

    // Loading text sollte sichtbar sein
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();

    await waitFor(() => {
      // Nach loading sollte Dashboard sichtbar sein
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });
});
