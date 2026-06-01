import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { IPCService } from '../services/ipcService';
import type { AppSnapshot, AppSnapshotRefreshSignal } from '../contracts/appSnapshot';

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
  const createAppSnapshot = (overrides: Partial<AppSnapshot> = {}): AppSnapshot => ({
    app: {
      version: '2.0.1',
    },
    status: {
      emoji: '',
      text: '',
      stateCheckValue: '',
    },
    daemon: { running: true },
    sources: {
      spotify: { name: 'spotify', enabled: true, isActive: false },
      appleMusic: { name: 'appleMusic', enabled: true, isActive: false },
      zoom: { name: 'zoom', enabled: true, isActive: false },
      teams: { name: 'teams', enabled: true, isActive: false },
      huddle: { name: 'huddle', enabled: true, isActive: false },
    },
    update: null,
    setup: {
      tokensConfigured: true,
      isFirstRun: false,
    },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show FirstRunDialog when isFirstRun is true', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue(
      createAppSnapshot({
        setup: { tokensConfigured: false, isFirstRun: true },
      })
    );
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('first-run-dialog')).toBeInTheDocument();
    });

    // Dashboard sollte NICHT sichtbar sein
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('should show Dashboard when isFirstRun is false', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue(createAppSnapshot());
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    // FirstRunDialog sollte NICHT sichtbar sein
    expect(screen.queryByTestId('first-run-dialog')).not.toBeInTheDocument();
  });

  it('should hide FirstRunDialog when onComplete is called', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue(
      createAppSnapshot({
        setup: { tokensConfigured: false, isFirstRun: true },
      })
    );
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

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

  it('should bootstrap the app shell from the shared app snapshot', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue(createAppSnapshot());
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

    render(<App />);

    await waitFor(() => {
      expect(mockIPCService.getAppSnapshot).toHaveBeenCalled();
    });
  });

  it('should handle app snapshot errors gracefully', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn().mockRejectedValue(new Error('snapshot failed'));
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('should show loading state initially', async () => {
    const mockIPCService = IPCService as any;
    mockIPCService.getAppSnapshot = vi.fn(() =>
      new Promise(resolve => setTimeout(() => resolve(createAppSnapshot()), 100))
    );
    mockIPCService.onAppSnapshotChanged = vi.fn(() => () => {});

    render(<App />);

    // Loading text sollte sichtbar sein
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();

    await waitFor(() => {
      // Nach loading sollte Dashboard sichtbar sein
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  it('should refresh first-run and daemon state from snapshot change notifications', async () => {
    const mockIPCService = IPCService as any;
    let snapshotChangedCallback: ((signal: AppSnapshotRefreshSignal) => void) | undefined;

    mockIPCService.getAppSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createAppSnapshot({ daemon: { running: false } }))
      .mockResolvedValueOnce(
        createAppSnapshot({
          daemon: { running: true },
          setup: { tokensConfigured: false, isFirstRun: true },
        })
      );
    mockIPCService.onAppSnapshotChanged = vi.fn((callback: (signal: AppSnapshotRefreshSignal) => void) => {
      snapshotChangedCallback = callback;
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    await act(async () => {
      snapshotChangedCallback?.({ reason: 'setup' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('first-run-dialog')).toBeInTheDocument();
    });
  });
});
