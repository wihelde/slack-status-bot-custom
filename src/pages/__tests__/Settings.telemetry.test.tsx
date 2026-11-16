import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Settings from '../Settings';
import type { ElectronAPI } from '../../contracts/ipc';
import { createAppConfigStore } from '../../config/appConfigStore';
import { createHostTelemetry } from '../../main/telemetry';
import { registerTelemetryIpcHandlers } from '../../main/ipcHandlers';

let directory: string;
let telemetry: ReturnType<typeof createHostTelemetry>;
const copy = vi.fn(async () => {});

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-telemetry-test-'));
  telemetry = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake_test_only' },
    appVersion: '2.3.4',
  });
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<unknown>>();
  registerTelemetryIpcHandlers({ handle: (channel, handler) => { handlers.set(channel, handler); } }, telemetry);
  window.electronAPI = {
    getTelemetrySettings: () => handlers.get('get-telemetry-settings')!({}),
    setTelemetryEnabled: (value: boolean) => handlers.get('set-telemetry-enabled')!({}, value),
    getTokens: async () => ({ success: true, data: { tokens: [], count: 0, connections: [] } }),
    onAppSnapshotChanged: () => () => {},
    getMeetingDnd: async () => ({ success: true, data: true }),
    getSourceOrder: async () => ({ success: false }),
    getLogLevel: async () => ({ success: false }),
    getAutoLaunch: async () => ({ success: false }),
    getAppSnapshot: async () => ({ success: false }),
    getStatusConfiguration: async () => ({ success: true, data: [] }),
  } as unknown as ElectronAPI;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  copy.mockClear();
});

afterEach(async () => {
  await telemetry.shutdown();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('persists the shared usage/diagnostic switch through host IPC and copies its random diagnostic ID', async () => {
  const page = render(<Settings />);
  fireEvent.click(await screen.findByRole('button', { name: /Automation/ }));
  const toggle = screen.getByRole('checkbox', { name: 'Share usage statistics and error diagnostics' });
  expect(toggle).toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  const restarted = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }), configuration: null, appVersion: '2.3.5',
  });
  expect(restarted.getSettings().enabled).toBe(false);
  page.unmount();
  render(<Settings />);
  fireEvent.click(await screen.findByRole('button', { name: /Automation/ }));
  expect(screen.getByRole('checkbox', { name: 'Share usage statistics and error diagnostics' })).not.toBeChecked();
  expect(screen.getByLabelText('Diagnostic ID')).toHaveValue(restarted.getSettings().diagnosticId);
  fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic ID' }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(restarted.getSettings().diagnosticId));
  expect(screen.getByRole('status')).toHaveTextContent('Diagnostic ID copied');
  await restarted.shutdown();
});

it('keeps the saved switch on after a failed save and leaves the ID selectable when copying fails', async () => {
  window.electronAPI.setTelemetryEnabled = async () => ({ success: false, error: 'Disk unavailable' });
  copy.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  render(<Settings />);
  fireEvent.click(await screen.findByRole('button', { name: /Automation/ }));
  const toggle = screen.getByRole('checkbox', { name: 'Share usage statistics and error diagnostics' });
  fireEvent.click(toggle);
  await screen.findByText('Could not save collection preference. Please try again.');
  expect(toggle).toBeChecked();
  expect(toggle).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostic ID' }));
  await screen.findByText('Copy failed; select the diagnostic ID instead.');
  expect(screen.getByLabelText('Diagnostic ID')).toHaveValue(telemetry.getSettings().diagnosticId);
});
