// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppConfigStore } from '../../config/appConfigStore';
import { createHostTelemetry } from '../telemetry';
import { createUpdateBridge } from '../updateBridge';
import { registerTelemetryIpcHandlers } from '../ipcHandlers';
import { IPC_CHANNELS, type IpcResult } from '../../contracts/ipc';
import { createWindowLifecycle } from '../windowLifecycle';

let directory: string;
let telemetry: ReturnType<typeof createHostTelemetry>;
let events: { event: string; properties: Record<string, unknown> }[];
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'observability-flow-'));
  events = [];
  telemetry = createHostTelemetry({ configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' }, appVersion: '2.4.0',
    fetch: async (_url, init) => { events.push(...JSON.parse(String(init.body)).batch); return new Response('{}'); } });
});
afterEach(async () => { await telemetry.shutdown(); fs.rmSync(directory, { recursive: true, force: true }); });

function releaseCheck(statusCode: number, body: string) {
  const listeners = new Map<string, (chunk?: string) => void>();
  const notifications = vi.fn();
  const bridge = createUpdateBridge({ app: { getVersion: () => '2.4.0' }, autoUpdater: { on: vi.fn() },
    getTelemetry: () => telemetry, isDev: false, log: vi.fn(), emitAppSnapshotChanged: vi.fn(),
    onUpdateAvailable: vi.fn(), refreshTrayMenu: vi.fn(), notifyUpdateAvailable: notifications,
    request: (_options, callback) => {
      callback({ statusCode, on: (event, handler) => { listeners.set(event, handler); } });
      return { on: vi.fn(), end: () => { listeners.get('data')?.(body); listeners.get('end')?.(); } };
    }, setIntervalFn: setInterval });
  return { bridge, notifications };
}

it('observes each real release check without suppressing repeated available notifications or leaking response contents', async () => {
  const { bridge, notifications } = releaseCheck(200, '[{"tag_name":"v2.5.0","private":"xoxp-secret"}]');
  bridge.checkForUpdates(); bridge.checkForUpdates();
  releaseCheck(200, '[{"tag_name":"v2.4.0"}]').bridge.checkForUpdates();
  releaseCheck(503, 'secret server response').bridge.checkForUpdates();
  releaseCheck(200, '[{"tag_name":"private release"}]').bridge.checkForUpdates();
  await telemetry.shutdown();
  expect(notifications).toHaveBeenCalledTimes(2);
  const checks = events.filter(event => event.event === 'update_check');
  expect(checks.map(event => event.properties.outcome)).toEqual(['available', 'available', 'current', 'failed', 'failed']);
  expect(checks[0].properties).toMatchObject({ target_version: '2.5.0', provider: 'gitlab', app_version: '2.4.0' });
  expect(JSON.stringify(events)).not.toMatch(/xoxp-secret|secret server|private release/);
});

it('rejects forged renderer properties, keeps useful error locations, and honors collection preferences', async () => {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
  registerTelemetryIpcHandlers({ handle: (channel, handler) => { handlers.set(channel, handler); } }, telemetry);
  const observe = (payload: unknown) => handlers.get(IPC_CHANNELS.observeRenderer)!({}, payload);
  await observe({ kind: 'ui', action: 'diagnostic_id_copied', privateText: 'Private Song', environment: 'production' });
  expect((await observe({ kind: 'update', action: 'link_opened', target_version: 'https://private.invalid' })).success).toBe(false);
  await observe({ kind: 'error', type: 'TypeError', step: 'react.render', message: 'Private Song xoxp-secret',
    stack: 'TypeError: Private Song\n    at render (/Users/alice/app/src/pages/Dashboard.tsx:12:3)' });
  telemetry.setEnabled(false); telemetry.setEnabled(true);
  await observe({ kind: 'ui', action: 'support_opened' });
  await telemetry.shutdown();
  // Earlier queued events are discarded with the disabled SDK session.
  expect(events.map(event => event.event)).toEqual(['ui_interaction']);
  expect(events[0].properties).toMatchObject({ action: 'support_opened', environment: 'test' });
  expect(JSON.stringify(events)).not.toMatch(/Private Song|xoxp-secret|alice/);
});

it('captures sanitized renderer errors through IPC and reports window failure and recovery without URLs', async () => {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
  registerTelemetryIpcHandlers({ handle: (channel, handler) => { handlers.set(channel, handler); } }, telemetry);
  await handlers.get(IPC_CHANNELS.observeRenderer)!({}, { kind: 'error', type: 'TypeError', step: 'window.error',
    message: "Cannot read properties of undefined (reading 'enabled')", stack: 'Error\n    at render (/Users/alice/app/src/pages/Dashboard.tsx:12:3)' });
  const webListeners = new Map<string, (...args: unknown[]) => void>();
  const lifecycle = createWindowLifecycle({ app: {}, BrowserWindow: class {
    show = vi.fn(); focus = vi.fn(); hide = vi.fn(); loadURL = vi.fn(); on = vi.fn(); once = vi.fn();
    webContents = { send: vi.fn(), openDevTools: vi.fn(), setWindowOpenHandler: vi.fn(),
      on: (event: string, callback: (...args: unknown[]) => void) => { webListeners.set(event, callback); } };
  }, shell: { openExternal: vi.fn() }, isDev: false, preloadPath: '/runtime/preload.js', getStartUrl: () => 'file:///runtime/index.html',
    hasTray: () => true, onClosed: vi.fn(), getTelemetry: () => telemetry });
  lifecycle.createWindow();
  webListeners.get('did-fail-load')?.({}, -3, 'cancelled', 'secret-url', true);
  webListeners.get('did-fail-load')?.({}, -105, 'ERR_NAME_NOT_RESOLVED', 'secret-url', true);
  webListeners.get('did-finish-load')?.();
  await telemetry.shutdown();
  expect(events.find(event => event.event === 'process_health')?.properties).toMatchObject({ outcome: 'load_failed', exit_code: -105 });
  expect(events.filter(event => event.event === 'process_health')).toHaveLength(1);
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ component: 'renderer',
    message: "Cannot read properties of undefined (reading 'enabled')" });
  expect(events.find(event => event.event === '$exception' && event.properties.step === 'window.load')?.properties.code).toBe('ERR_NAME_NOT_RESOLVED');
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties.step).toBe('window.load');
  expect(JSON.stringify(events)).not.toMatch(/secret-url|private description|alice/);
});

it('discards an updater error from before opt-out instead of resurrecting its diagnostic episode', async () => {
  const listeners = new Map<string, (payload?: unknown) => void>();
  const bridge = createUpdateBridge({ app: { getVersion: () => '2.4.0' }, autoUpdater: { on: (event, listener) => listeners.set(event, listener) },
    getTelemetry: () => telemetry, isDev: false, log: vi.fn(), emitAppSnapshotChanged: vi.fn(), onUpdateAvailable: vi.fn(),
    refreshTrayMenu: vi.fn(), request: vi.fn(), setIntervalFn: setInterval });
  bridge.setupUpdateListeners();
  listeners.get('checking-for-update')?.();
  telemetry.setEnabled(false); telemetry.setEnabled(true);
  listeners.get('error')?.(new Error('Previous check failed'));
  await telemetry.shutdown();
  expect(events).toEqual([]);
});
