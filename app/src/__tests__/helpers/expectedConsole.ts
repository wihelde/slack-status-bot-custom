import { expect, onTestFinished, vi } from 'vitest';

/** Check deliberately triggered diagnostics and explain them beside the test result. */
export function expectConsoleMessages(
  level: 'warn' | 'error',
  messages: readonly RegExp[],
  explanation: string,
) {
  const original = console[level];
  const observed: string[] = [];
  const unexpected: unknown[][] = [];
  const diagnostic = vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (messages.some(pattern => pattern.test(message))) {
      observed.push(message);
    } else {
      unexpected.push(args);
      original.apply(console, args);
    }
  });

  onTestFinished(() => {
    diagnostic.mockRestore();
    expect(unexpected, 'Unerwartete Konsolenmeldungen').toEqual([]);
    for (const pattern of messages) {
      expect(observed.some(message => pattern.test(message)),
        `Erwartete Konsolenmeldung fehlt: ${pattern}`).toBe(true);
    }
    console.info(`[Erwarteter ${level === 'error' ? 'Fehler' : 'Hinweis'} geprüft] ${explanation}`);
  });

  return diagnostic;
}
