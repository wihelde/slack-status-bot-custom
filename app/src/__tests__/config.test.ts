import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('persists slack tokens without losing daemon-managed fields', () => {
    const store = createAppConfigStore({ configDir: testConfigDir });

    store.updateDaemonSettings({
      sources: {
        spotify: false,
        appleMusic: true,
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
    expect(config.sourceOrder).toEqual(DEFAULT_SOURCE_ORDER);
    expect(config.statusConfiguration.customStatuses.length).toBeGreaterThan(0);
    expect(config.statusConfiguration.overridablePatterns).toEqual(DEFAULT_OVERRIDABLE_PATTERNS);
  });

  it('recovers from corrupted config files and writes back defaults', () => {
    const configPath = path.join(testConfigDir, 'config.json');
    fs.writeFileSync(configPath, '{not-valid-json', 'utf-8');

    const store = createAppConfigStore({ configDir: testConfigDir });
    const config = store.load();
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    expect(config.slackTokens).toEqual([]);
    expect(config.sourceOrder).toEqual(DEFAULT_SOURCE_ORDER);
    expect(persisted.statusConfiguration.customStatuses.length).toBeGreaterThan(0);
    expect(persisted.statusConfiguration.overridablePatterns).toEqual(DEFAULT_OVERRIDABLE_PATTERNS);
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
