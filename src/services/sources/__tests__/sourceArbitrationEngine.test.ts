import { describe, expect, it } from 'vitest';
import { SourceName } from '../../../config/sourceCatalog';
import { SourceArbitrationEngine } from '../sourceArbitrationEngine';

const buildStatuses = (overrides?: Partial<Record<SourceName, Partial<any>>>) => ({
  spotify: {
    name: 'Spotify',
    isActive: false,
    enabled: true,
    emoji: ':spotify:',
    message: undefined,
    ...overrides?.spotify,
  },
  appleMusic: {
    name: 'Apple Music',
    isActive: false,
    enabled: true,
    emoji: ':apple:',
    message: undefined,
    ...overrides?.appleMusic,
  },
  youtubeMusic: {
    name: 'YouTube Music',
    isActive: false,
    enabled: true,
    emoji: ':youtube-music:',
    message: undefined,
    ...overrides?.youtubeMusic,
  },
  zoom: {
    name: 'Zoom',
    isActive: false,
    enabled: true,
    emoji: ':zoom:',
    message: undefined,
    ...overrides?.zoom,
  },
  teams: {
    name: 'Microsoft Teams',
    isActive: false,
    enabled: true,
    emoji: ':teams:',
    message: undefined,
    ...overrides?.teams,
  },
  huddle: {
    name: 'Slack Huddle',
    isActive: false,
    enabled: true,
    emoji: ':huddle:',
    message: undefined,
    ...overrides?.huddle,
  },
});

describe('SourceArbitrationEngine', () => {
  const engine = new SourceArbitrationEngine();

  it('should classify source activation', () => {
    const change = engine.determineChange(
      'spotify',
      { wasActive: false, lastMessage: '' },
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
      }).spotify
    );

    expect(change.type).toBe('activated');
  });

  it('should classify source deactivation', () => {
    const change = engine.determineChange(
      'spotify',
      { wasActive: true, lastMessage: 'Track One' },
      buildStatuses().spotify
    );

    expect(change.type).toBe('deactivated');
  });

  it('should classify message-only changes for an active source', () => {
    const change = engine.determineChange(
      'spotify',
      { wasActive: true, lastMessage: 'Track One' },
      buildStatuses({
        spotify: { isActive: true, message: 'Track Two' },
      }).spotify
    );

    expect(change.type).toBe('message-changed');
  });

  it('should pick the highest priority active source', () => {
    const winner = engine.pickWinner(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        zoom: { isActive: true, message: 'In a meeting' },
        spotify: { isActive: true, message: 'Track One' },
      })
    );

    expect(winner).toEqual(
      expect.objectContaining({
        sourceName: 'spotify',
      })
    );
  });

  it('should ignore disabled sources when picking a winner', () => {
    const winner = engine.pickWinner(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, enabled: false, message: 'Track One' },
        zoom: { isActive: true, message: 'In a meeting' },
      })
    );

    expect(winner).toEqual(
      expect.objectContaining({
        sourceName: 'zoom',
      })
    );
  });

  it('should pick the next active source when excluding a deactivated winner', () => {
    const winner = engine.pickWinner(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
        zoom: { isActive: true, message: 'In a meeting' },
      }),
      { excludeSource: 'spotify' }
    );

    expect(winner).toEqual(
      expect.objectContaining({
        sourceName: 'zoom',
      })
    );
  });

  it('should keep tracking state inside the arbitration engine across evaluations', () => {
    engine.resetTrackingState();

    const firstSnapshot = engine.evaluate(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
      })
    );

    expect(firstSnapshot.changes).toEqual([
      expect.objectContaining({
        sourceName: 'spotify',
        type: 'activated',
      }),
    ]);

    engine.recordHandledStatus('spotify', 'Track One');

    const secondSnapshot = engine.evaluate(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track Two' },
      })
    );

    expect(secondSnapshot.changes).toEqual([
      expect.objectContaining({
        sourceName: 'spotify',
        type: 'message-changed',
        previous: expect.objectContaining({
          wasActive: true,
          lastMessage: 'Track One',
        }),
      }),
    ]);
  });

  it('should keep retrying an active source message until it is recorded as handled', () => {
    engine.resetTrackingState();

    engine.evaluate(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
      })
    );

    const retrySnapshot = engine.evaluate(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
      })
    );

    expect(retrySnapshot.changes).toEqual([
      expect.objectContaining({
        sourceName: 'spotify',
        type: 'message-changed',
      }),
    ]);
  });

  it('should clear tracked source state when resetTrackingState is called', () => {
    engine.evaluate(
      ['spotify', 'zoom', 'teams', 'appleMusic', 'huddle'],
      buildStatuses({
        spotify: { isActive: true, message: 'Track One' },
      })
    );

    engine.resetTrackingState();

    expect(engine.getTrackingState().spotify).toEqual({
      wasActive: false,
      lastMessage: '',
    });
  });

  it('should safely ignore unknown source names when picking a winner', () => {
    const winner = engine.pickWinner(
      ['invalid' as SourceName, 'zoom', 'spotify'],
      buildStatuses({
        zoom: { isActive: true, message: 'In a meeting' },
      })
    );

    expect(winner).toEqual(
      expect.objectContaining({
        sourceName: 'zoom',
      })
    );
  });
});
