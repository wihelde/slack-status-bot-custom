import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Settings from '../Settings';
import type { ElectronAPI, TokensPayload } from '../../contracts/ipc';

describe('Slack Workspace settings', () => {
  const getTokens = vi.fn<() => Promise<{ success: true; data: TokensPayload }>>();
  const openSetupLink = vi.fn(async (_link: string) => ({ success: true as const }));
  const removeWorkspace = vi.fn(async (_teamId: string) => ({ success: true as const }));

  beforeEach(() => {
    vi.resetAllMocks();
    window.electronAPI = {
      getTokens,
      openSetupLink,
      removeWorkspace,
      onAppSnapshotChanged: () => () => {},
      getMeetingDnd: async () => ({ success: true, data: false }),
      setMeetingDnd: vi.fn(async () => ({ success: true })),
      getSourceOrder: async () => ({ success: false }),
      getLogLevel: async () => ({ success: false }),
      getAutoLaunch: async () => ({ success: false }),
      getAppSnapshot: async () => ({ success: false }),
      getStatusConfiguration: async () => ({ success: true, data: [] }),
    } as unknown as ElectronAPI;
  });

  it('loads and saves the meeting DND preference', async () => {
    getTokens.mockResolvedValue({ success: true, data: { tokens: [], count: 0, connectionError: null, oauthMessage: null, connections: [] } });
    render(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: /Automation/ }));
    const toggle = screen.getByRole('checkbox', { name: /Automatically enable Do Not Disturb/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(window.electronAPI.setMeetingDnd).toHaveBeenCalledWith(true);
  });

  it('shows verified workspace identities and an invalid legacy connection without displaying tokens', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: ['xoxp...1234'], count: 1, connectionError: null, oauthMessage: null,
      connections: [
        { teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice', state: 'connected' },
        { teamId: null, teamName: null, userId: null, userName: null, state: 'invalid' },
      ],
    } });

    render(<Settings />);

    const alpha = (await screen.findByText('Alpha')).closest<HTMLElement>('.token-item')!;
    expect(within(alpha).getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Token invalid · Use a Setup Link to reconnect')).toBeInTheDocument();
    expect(screen.queryByText('xoxp...1234')).not.toBeInTheDocument();
  });

  it('lets an administrator generate a credential-free link and a user open it', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 0, connectionError: null, oauthMessage: null, connections: [],
    } });
    render(<Settings />);

    fireEvent.click(await screen.findByText('Create Setup Link'));
    fireEvent.change(screen.getByLabelText('Slack Client ID'), { target: { value: '123.456' } });
    fireEvent.change(screen.getByLabelText('Workspace ID'), { target: { value: 'T-ALPHA' } });
    fireEvent.click(screen.getByText('Generate link'));
    const link = screen.getByLabelText('Generated Setup Link') as HTMLInputElement;
    expect(link.value).toBe('slack-status-bot://connect?client_id=123.456&team_id=T-ALPHA');
    expect(link.value).not.toContain('secret');

    fireEvent.change(screen.getByLabelText('Setup Link'), { target: { value: link.value } });
    fireEvent.click(screen.getByText('Connect workspace'));
    expect(openSetupLink).toHaveBeenCalledWith(link.value);
    await waitFor(() => expect(screen.getByLabelText('Setup Link')).toHaveValue(''));
  });

  it('rejects a Slack App ID entered as the workspace ID', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 0, connectionError: null, oauthMessage: null, connections: [],
    } });
    render(<Settings />);

    fireEvent.click(await screen.findByText('Create Setup Link'));
    fireEvent.change(screen.getByLabelText('Slack Client ID'), { target: { value: '123.456' } });
    fireEvent.change(screen.getByLabelText('Workspace ID'), { target: { value: 'A0C4A9QNWAX' } });
    fireEvent.click(screen.getByText('Generate link'));

    expect(screen.getByText('Workspace ID must start with T; A identifies a Slack app')).toBeInTheDocument();
    expect(screen.queryByLabelText('Generated Setup Link')).not.toBeInTheDocument();
  });

  it('removes the selected workspace row while leaving the other visible', async () => {
    const alpha = { teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice', state: 'connected' as const };
    const beta = { teamId: 'T-B', teamName: 'Beta', userId: 'U-B', userName: 'Bob', state: 'connected' as const };
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 2, connections: [alpha, beta], connectionError: null, oauthMessage: null,
    } });
    removeWorkspace.mockImplementation(async () => {
      getTokens.mockResolvedValue({ success: true, data: {
        tokens: [], count: 1, connections: [beta], connectionError: null, oauthMessage: null,
      } });
      return { success: true };
    });
    render(<Settings />);
    const row = (await screen.findByText('Alpha')).closest('.token-item')!;

    fireEvent.click(row.querySelector('button[aria-label="Remove Alpha locally"]')!);

    expect(removeWorkspace).toHaveBeenCalledWith('T-A');
    expect(await screen.findByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('keeps a workspace-specific Reconnect action visible after authorization expires', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 1, connectionError: null, oauthMessage: null,
      connections: [
        { teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice', state: 'auth-required', canReconnect: true },
        { teamId: 'T-B', teamName: 'Beta', userId: 'U-B', userName: 'Bob', state: 'connected', canReconnect: true },
      ],
    } });
    render(<Settings />);

    const alpha = (await screen.findByText('Alpha')).closest<HTMLElement>('.token-item')!;
    expect(within(alpha).getByText('Reconnect required')).toBeInTheDocument();
    expect(within(alpha).getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('labels a temporary renewal problem without asking the user to reconnect', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 1, connectionError: null, oauthMessage: null,
      connections: [{ teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice',
        state: 'connected', canReconnect: true, refreshIssue: 'temporary' }],
    } });
    render(<Settings />);

    const alpha = (await screen.findByText('Alpha')).closest<HTMLElement>('.token-item')!;
    expect(within(alpha).getByText('Connection retrying')).toBeInTheDocument();
    expect(screen.queryByText('Reconnect required')).not.toBeInTheDocument();
  });

  it('opens automation at the top with startup alongside status settings', async () => {
    getTokens.mockResolvedValue({ success: true, data: {
      tokens: [], count: 0, connections: [], connectionError: null, oauthMessage: null,
    } });
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    render(<main className="main-content"><Settings /></main>);

    const automation = await screen.findByRole('button', { name: /Automation/ });
    await act(async () => {
      fireEvent.click(automation);
    });

    expect(screen.getByRole('heading', { name: /Source Priority/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Start App when computer boots/ })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
