import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemePreference, readThemePreference } from '../theme';

describe('appearance preference', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('persists manual choices and restores system following', () => {
    expect(readThemePreference()).toBe('system');

    applyThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    applyThemePreference('light');
    expect(readThemePreference()).toBe('light');

    applyThemePreference('system');
    expect(readThemePreference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
