import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusConfigEditor } from '../StatusConfigEditor';
import { IPCService } from '../../services/ipcService';
import type { CustomStatusConfig } from '../../config/statusConfig';

vi.mock('../../services/ipcService');

describe('StatusConfigEditor', () => {
  const offlineStatus = (id: string, message: string): CustomStatusConfig => ({
    id,
    emoji: ':mobile_phone_off:',
    message,
    days: [],
    enableDND: false,
    presence: 'away',
    quickActionLabel: null,
    category: 'offline',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(IPCService.getStatusConfiguration).mockResolvedValue([
      offlineStatus('offline_1', 'First message'),
      offlineStatus('offline_2', 'Second message'),
    ]);
    vi.mocked(IPCService.updateStatusConfiguration).mockResolvedValue(true);
  });

  it('lets the user edit the offline message list and save it', async () => {
    render(<StatusConfigEditor />);

    fireEvent.click(await screen.findByRole('heading', { name: 'Offline Messages' }));
    fireEvent.change(screen.getByLabelText('Offline message 1'), {
      target: { value: 'Changed message' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete offline message' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Add Offline Message' }));
    fireEvent.change(screen.getByLabelText('Offline message 2'), {
      target: { value: 'New message' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));

    await waitFor(() => {
      const savedStatuses = vi.mocked(IPCService.updateStatusConfiguration).mock.calls[0][0];
      expect(savedStatuses.filter(status => status.category === 'offline').map(status => status.message))
        .toEqual(['Changed message', 'New message']);
    });
  });

  it('keeps offline messages when scheduled statuses are deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(IPCService.getStatusConfiguration).mockResolvedValue([
      offlineStatus('offline_1', 'Still here'),
      {
        id: 'monday',
        emoji: ':monday:',
        message: 'Monday',
        days: [1],
        enableDND: false,
        presence: 'auto',
        quickActionLabel: null,
        category: 'day_based',
      },
    ]);

    render(<StatusConfigEditor />);
    fireEvent.click(await screen.findByRole('button', { name: /Delete All Scheduled/i }));

    await waitFor(() => {
      expect(vi.mocked(IPCService.updateStatusConfiguration)).toHaveBeenCalledWith([
        offlineStatus('offline_1', 'Still here'),
      ]);
    });
  });
});
