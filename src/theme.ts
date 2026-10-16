export type ThemePreference = 'system' | 'light' | 'dark';

const storageKey = 'slack-status-bot-theme';

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  if (preference === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }

  try {
    if (preference === 'system') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, preference);
  } catch {
    // The current window still uses the selected appearance when storage is unavailable.
  }
}
