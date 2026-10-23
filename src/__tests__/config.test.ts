import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createAppConfigStore } from '../config/appConfigStore';
import { DEFAULT_SOURCE_ORDER } from '../config/sourceCatalog';
import { DEFAULT_OVERRIDABLE_PATTERNS } from '../config/statusConfig';

describe('AppConfigStore', () => {
  let testConfigDir: string;

  beforeEach(() => {
    testConfigDir = path.join(os.tmpdir(), `slack-status-bot-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testConfigDir, { recursive: true, force: true });
  });

  it('keeps the meeting DND opt-out across restarts and unrelated saves', () => {
    const store = createAppConfigStore({ configDir: testConfigDir });
    expect(store.load().meetingDnd).toBe(true);
    store.updateDaemonSettings({ meetingDnd: false });
    store.updateSlackTokens(['test-token']);
    store.clearSlackTokens();
    const restarted = createAppConfigStore({ configDir: testConfigDir });
    expect(restarted.getDaemonSettings().meetingDnd).toBe(false);
  });

  it('persists slack tokens without losing daemon-managed fields', () => {
    const store = createAppConfigStore({ configDir: testConfigDir });

    store.updateDaemonSettings({
      sources: {
        spotify: false,
        appleMusic: true,
        youtubeMusic: true,
        zoom: true,
        teams: true,
        huddle: true,
      },
      sourceOrder: ['zoom', 'spotify', 'appleMusic', 'teams', 'huddle'],
    });

    const savedConfig = store.updateSlackTokens(['xoxp-test-token-123']);

    expect(savedConfig.slackTokens).toEqual(['xoxp-test-token-123']);
    expect(savedConfig.sources.spotify).toBe(false);
    expect(savedConfig.sourceOrder[0]).toBe('zoom');
  });

  it('normalizes missing and partial config files through the persistence boundary', () => {
    const configPath = path.join(testConfigDir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        slackTokens: 'xoxp-legacy-token',
        sources: { spotify: false },
      }),
      'utf-8'
    );

    const store = createAppConfigStore({ configDir: testConfigDir });
    const config = store.load();

    expect(config.slackTokens).toEqual(['xoxp-legacy-token']);
    expect(config.sources.spotify).toBe(false);
    expect(config.sources.appleMusic).toBe(true);
    expect((config.sources as Record<string, boolean>).youtubeMusic).toBe(true);
    expect(config.sourceOrder).toContain('youtubeMusic');
    expect(config.sourceOrder).toEqual(DEFAULT_SOURCE_ORDER);
    expect(config.statusConfiguration.customStatuses.length).toBeGreaterThan(0);
    expect(config.statusConfiguration.offlineMessages).toContain('My dog ate my away message');
    expect(config.statusConfiguration.overridablePatterns).toEqual(DEFAULT_OVERRIDABLE_PATTERNS);
  });

  it('preserves corrupted config files and reports the recovery', () => {
    const configPath = path.join(testConfigDir, 'config.json');
    const corruptedContent = '{"slackTokens":["test-token"]';
    fs.writeFileSync(configPath, corruptedContent, 'utf-8');
    const onConfigRecovery = vi.fn();

    const store = createAppConfigStore({ configDir: testConfigDir, onConfigRecovery });
    const config = store.load();
    const backupName = fs.readdirSync(testConfigDir).find(name => name.startsWith('config.json.corrupt-'));

    expect({
      activeConfigExists: fs.existsSync(configPath),
      backupContent: backupName
        ? fs.readFileSync(path.join(testConfigDir, backupName), 'utf-8')
        : null,
      loadedTokens: config.slackTokens,
      recovery: onConfigRecovery.mock.calls[0]?.[0],
    }).toMatchObject({
      activeConfigExists: false,
      backupContent: corruptedContent,
      loadedTokens: [],
      recovery: {
        configPath,
        backupPath: expect.stringContaining('config.json.corrupt-'),
      },
    });

    store.updateSlackTokens(['replacement-token']);

    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8')).slackTokens)
      .toEqual(['replacement-token']);
    expect(fs.readFileSync(path.join(testConfigDir, backupName!), 'utf-8'))
      .toBe(corruptedContent);
  });

  it('preserves unknown persisted fields through intentional merge rules', () => {
    const configPath = path.join(testConfigDir, 'config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        customNote: 'keep-me',
        slackTokens: ['old-token'],
      }),
      'utf-8'
    );

    const store = createAppConfigStore({ configDir: testConfigDir });
    store.updateLogLevel('INFO');

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(persisted.customNote).toBe('keep-me');
    expect(persisted.logLevel).toBe('INFO');
    expect(persisted.slackTokens).toEqual(['old-token']);
  });
});
