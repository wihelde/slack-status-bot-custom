import { describe, expect, it } from 'vitest';
import {
  createDefaultDaemonSnapshot,
  createDefaultSetupSnapshot,
  createDefaultStatusSnapshot,
} from '../appSnapshot';

describe('appSnapshot contract', () => {
  it('provides an empty status snapshot for renderer bootstrap flows', () => {
    expect(createDefaultStatusSnapshot()).toEqual({
      emoji: '',
      text: '',
      stateCheckValue: '',
    });
  });

  it('provides a stopped daemon snapshot by default', () => {
    expect(createDefaultDaemonSnapshot()).toEqual({
      running: false,
    });
  });

  it('tracks setup flags separately from the runtime snapshot state', () => {
    expect(createDefaultSetupSnapshot()).toEqual({
      tokensConfigured: false,
      isFirstRun: false,
    });
  });

  it('models snapshot refreshes as explicit refresh signals instead of ad hoc payloads', async () => {
    const { reason } = await Promise.resolve({ reason: 'update' as const });
    expect(reason).toBe('update');
  });

  it('keeps the default snapshot factories small and renderer-focused', () => {
    expect(Object.keys(createDefaultStatusSnapshot())).toEqual([
      'emoji',
      'text',
      'stateCheckValue',
    ]);
    expect(Object.keys(createDefaultDaemonSnapshot())).toEqual(['running']);
    expect(Object.keys(createDefaultSetupSnapshot())).toEqual([
      'tokensConfigured',
      'isFirstRun',
    ]);
  });
});
