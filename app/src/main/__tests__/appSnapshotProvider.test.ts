import { describe, expect, it } from 'vitest';
import {
  createAppSnapshotProvider,
  createEmptyAppSnapshot,
  normalizeAppSourcesSnapshot,
} from '../appSnapshotProvider';

describe('AppSnapshotProvider', () => {
  it('builds one consolidated snapshot from main-process dependencies', async () => {
    const provider = createAppSnapshotProvider({
      getSlackStatus: async () => ({
        emoji: ':spotify_2:',
        text: 'Playing Music',
        stateCheckValue: 'spotify',
      }),
      getSourceStatuses: async () => ({
        spotify: {
          enabled: true,
          isActive: true,
          message: 'Playing Music',
        },
      }),
      getDaemonSnapshot: () => ({ running: true }),
      getUpdateSnapshot: () => ({
        version: '2.1.0',
        releaseDate: '2026-04-17T08:00:00.000Z',
      }),
      getSetupSnapshot: () => ({
        tokensConfigured: true,
        isFirstRun: false,
      }),
    });

    await expect(provider.getSnapshot()).resolves.toMatchObject({
      status: {
        emoji: ':spotify_2:',
        text: 'Playing Music',
      },
      daemon: {
        running: true,
      },
      sources: {
        spotify: {
          name: 'spotify',
          isActive: true,
          message: 'Playing Music',
        },
        zoom: {
          name: 'zoom',
          isActive: false,
        },
      },
      update: {
        version: '2.1.0',
      },
      setup: {
        tokensConfigured: true,
        isFirstRun: false,
      },
    });
  });

  it('normalizes missing source data into a full source snapshot record', () => {
    expect(normalizeAppSourcesSnapshot()).toMatchObject({
      spotify: { name: 'spotify', enabled: true, isActive: false },
      appleMusic: { name: 'appleMusic', enabled: true, isActive: false },
      zoom: { name: 'zoom', enabled: true, isActive: false },
      teams: { name: 'teams', enabled: true, isActive: false },
      huddle: { name: 'huddle', enabled: true, isActive: false },
    });
  });

  it('provides an empty snapshot baseline for no-daemon startup scenarios', () => {
    expect(createEmptyAppSnapshot()).toMatchObject({
      status: {
        emoji: '',
        text: '',
        stateCheckValue: '',
      },
      daemon: {
        running: false,
      },
      update: null,
      setup: {
        tokensConfigured: false,
        isFirstRun: false,
      },
    });
  });
});
