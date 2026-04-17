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
});
