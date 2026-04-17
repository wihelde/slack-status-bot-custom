import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard';
import { IPCService } from '../../services/ipcService';
import type { AppSnapshot } from '../../contracts/appSnapshot';

vi.mock('../../services/ipcService');

type StatusPayload = {
  emoji: string;
  text: string;
  stateCheckValue: string;
};

type SourceStatusesPayload = Record<
  'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle',
  { enabled?: boolean; isActive?: boolean; message?: string }
>;

describe('Dashboard', () => {
  const mockIPCService = IPCService as any;

  const createSourceStatuses = (
    overrides: Partial<SourceStatusesPayload> = {}
  ): SourceStatusesPayload => ({
    spotify: { enabled: true, isActive: true, message: 'Playing Music' },
    appleMusic: { enabled: true, isActive: false },
    zoom: { enabled: true, isActive: false },
    teams: { enabled: true, isActive: false },
    huddle: { enabled: true, isActive: false },
    ...overrides,
  });

  const createStatus = (overrides: Partial<StatusPayload> = {}): StatusPayload => ({
    emoji: ':spotify_2:',
    text: 'Playing Music',
    stateCheckValue: 'spotify',
    ...overrides,
  });

  const createAppSnapshot = (
    overrides: Partial<AppSnapshot> = {}
  ): AppSnapshot => ({
    status: createStatus(),
    daemon: { running: true },
    sources: {
      spotify: { name: 'spotify', enabled: true, isActive: true, message: 'Playing Music' },
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

    mockIPCService.getAppSnapshot = vi.fn().mockResolvedValue(createAppSnapshot());
    mockIPCService.getSlackStatus = vi.fn().mockResolvedValue(createStatus());
    mockIPCService.getDaemonStatus = vi.fn().mockResolvedValue({ running: true });
    mockIPCService.getSourceStatuses = vi
      .fn()
      .mockResolvedValue(createSourceStatuses());
    mockIPCService.getUpdateAvailable = vi.fn().mockResolvedValue(null);
    mockIPCService.getStatusConfiguration = vi.fn().mockResolvedValue(null);

    mockIPCService.goOnline = vi.fn().mockResolvedValue(true);
    mockIPCService.goAway = vi.fn().mockResolvedValue(true);
    mockIPCService.setStatus = vi.fn().mockResolvedValue(true);
    mockIPCService.setHoliday = vi.fn().mockResolvedValue(true);
    mockIPCService.toggleSource = vi.fn().mockResolvedValue(true);

    mockIPCService.onStatusChanged = vi.fn(() => () => {});
    mockIPCService.onSourceStatusChange = vi.fn(() => () => {});
    mockIPCService.onDaemonStatusChange = vi.fn(() => () => {});
    mockIPCService.onOpenHolidayModal = vi.fn(() => () => {});
    mockIPCService.onUpdateAvailable = vi.fn(() => () => {});
  });

  it('bootstraps the dashboard from the current IPC-backed renderer state', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(mockIPCService.getAppSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Slack Status Bot')).toBeInTheDocument();
    expect(screen.getByText(':spotify_2:')).toBeInTheDocument();
    expect(screen.getAllByText('Playing Music')).toHaveLength(2);
    expect(screen.getByText('🟢 Running')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /spotify/i })).toBeInTheDocument();
    expect(screen.getByText('✓ Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /holiday/i })).toBeInTheDocument();
  });

  it('refreshes the visible dashboard state after an action-driven status change', async () => {
    mockIPCService.getAppSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createAppSnapshot())
      .mockResolvedValueOnce(
        createAppSnapshot({
          status: createStatus({
            emoji: ':palm_tree:',
            text: 'strong vacationing (back on 24.11.2025)',
            stateCheckValue: 'not working',
          }),
          sources: {
            spotify: { name: 'spotify', enabled: true, isActive: false },
            appleMusic: { name: 'appleMusic', enabled: true, isActive: false },
            zoom: { name: 'zoom', enabled: true, isActive: false },
            teams: { name: 'teams', enabled: true, isActive: false },
            huddle: { name: 'huddle', enabled: true, isActive: false },
          },
        })
      );

    render(<Dashboard />);

    await screen.findAllByText('Playing Music');

    fireEvent.click(screen.getByRole('button', { name: /away/i }));

    await waitFor(() => {
      expect(mockIPCService.goAway).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockIPCService.getAppSnapshot).toHaveBeenCalledTimes(2);
      expect(screen.getByText(':palm_tree:')).toBeInTheDocument();
      expect(
        screen.getByText('strong vacationing (back on 24.11.2025)')
      ).toBeInTheDocument();
    });
  });

  it('applies event-driven status changes and refreshes sources through the same renderer model', async () => {
    let statusChangedCallback: ((statusData: any) => void) | undefined;

    mockIPCService.onStatusChanged = vi.fn((callback: (statusData: any) => void) => {
      statusChangedCallback = callback;
      return () => {};
    });

    mockIPCService.getAppSnapshot = vi
      .fn()
      .mockResolvedValueOnce(createAppSnapshot())
      .mockResolvedValueOnce(
        createAppSnapshot({
          status: createStatus({
            emoji: ':zoom:',
            text: 'In a meeting',
            stateCheckValue: 'zoom',
          }),
          sources: {
            spotify: { name: 'spotify', enabled: true, isActive: false },
            appleMusic: { name: 'appleMusic', enabled: true, isActive: false },
            zoom: { name: 'zoom', enabled: true, isActive: true, message: 'In a meeting' },
            teams: { name: 'teams', enabled: true, isActive: false },
            huddle: { name: 'huddle', enabled: true, isActive: false },
          },
        })
      );

    render(<Dashboard />);

    await screen.findAllByText('Playing Music');

    await act(async () => {
      statusChangedCallback?.({
        emoji: ':zoom:',
        message: 'In a meeting',
        stateValue: 'activeSource',
      });
    });

    await waitFor(() => {
      expect(mockIPCService.getAppSnapshot).toHaveBeenCalledTimes(2);
      expect(screen.getByText(':zoom:')).toBeInTheDocument();
      expect(screen.getAllByText('In a meeting')).toHaveLength(2);
    });

    const activeLabels = screen.getAllByText('✓ Active');
    expect(activeLabels).toHaveLength(1);
  });

  it('opens the holiday modal when the tray event arrives', async () => {
    let openHolidayModalCallback: (() => void) | undefined;

    mockIPCService.onOpenHolidayModal = vi.fn((callback: () => void) => {
      openHolidayModalCallback = callback;
      return () => {};
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(mockIPCService.onOpenHolidayModal).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      openHolidayModalCallback?.();
    });

    expect(screen.getByText(/set holiday status/i)).toBeInTheDocument();
  });
});
