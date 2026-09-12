import { describe, expect, it } from 'vitest';
import {
  createAppSnapshotProvider,
  createEmptyAppSnapshot,
  normalizeAppDaemonSnapshot,
  normalizeAppMetadataSnapshot,
  normalizeAppSetupSnapshot,
  normalizeAppStatusSnapshot,
  normalizeAppUpdateSnapshot,
  normalizeAppSourcesSnapshot,
} from '../appSnapshotProvider';

describe('AppSnapshotProvider', () => {
  it('builds one consolidated snapshot from main-process dependencies', async () => {
    const provider = createAppSnapshotProvider({
      getAppMetadataSnapshot: () => ({
        version: '2.0.1',
      }),
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
      app: {
        version: '2.0.1',
      },
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
      youtubeMusic: { name: 'youtubeMusic', enabled: true, isActive: false },
      zoom: { name: 'zoom', enabled: true, isActive: false },
      teams: { name: 'teams', enabled: true, isActive: false },
      huddle: { name: 'huddle', enabled: true, isActive: false },
    });
  });

  it('provides an empty snapshot baseline for no-daemon startup scenarios', () => {
    expect(createEmptyAppSnapshot()).toMatchObject({
      app: {
        version: '',
      },
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

  it('normalizes partial dependency data into the canonical runtime model', async () => {
    const provider = createAppSnapshotProvider({
      getAppMetadataSnapshot: () => ({
        version: '2.0.1',
      }),
      getSlackStatus: async () => ({
        text: 'Heads down',
      }),
      getSourceStatuses: async () => ({
        spotify: {
          enabled: false,
          isActive: true,
          message: '',
        },
      }),
      getDaemonSnapshot: () => null,
      getUpdateSnapshot: () => ({
        version: '',
        releaseDate: '2026-04-19T09:00:00.000Z',
      }),
      getSetupSnapshot: () => ({
        tokensConfigured: true,
      }),
    });

    await expect(provider.getSnapshot()).resolves.toEqual({
      app: {
        version: '2.0.1',
      },
      status: {
        emoji: '',
        text: 'Heads down',
        stateCheckValue: '',
      },
      daemon: {
        running: false,
      },
      sources: {
        spotify: {
          name: 'spotify',
          enabled: false,
          isActive: true,
        },
        appleMusic: {
          name: 'appleMusic',
          enabled: true,
          isActive: false,
        },
        youtubeMusic: {
          name: 'youtubeMusic',
          enabled: true,
          isActive: false,
        },
        zoom: {
          name: 'zoom',
          enabled: true,
          isActive: false,
        },
        teams: {
          name: 'teams',
          enabled: true,
          isActive: false,
        },
        huddle: {
          name: 'huddle',
          enabled: true,
          isActive: false,
        },
      },
      update: null,
      setup: {
        tokensConfigured: true,
        isFirstRun: false,
      },
    });
  });

  it('exposes focused normalizers for the canonical app-state fields', () => {
    expect(normalizeAppMetadataSnapshot({ version: '2.0.1' })).toEqual({
      version: '2.0.1',
    });

    expect(normalizeAppStatusSnapshot({ emoji: ':wave:' })).toEqual({
      emoji: ':wave:',
      text: '',
      stateCheckValue: '',
    });

    expect(normalizeAppDaemonSnapshot(undefined)).toEqual({
      running: false,
    });

    expect(normalizeAppSetupSnapshot({ isFirstRun: true })).toEqual({
      tokensConfigured: false,
      isFirstRun: true,
    });

    expect(
      normalizeAppUpdateSnapshot({
        version: '2.2.0',
        releaseDate: '2026-04-19T09:00:00.000Z',
      })
    ).toEqual({
      version: '2.2.0',
      releaseDate: '2026-04-19T09:00:00.000Z',
    });
  });
});
