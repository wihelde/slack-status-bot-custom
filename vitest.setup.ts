// Vitest setup file
import '@testing-library/jest-dom/vitest';
import { beforeEach, onTestFinished, vi } from 'vitest';

beforeEach(() => {
  // Routine app progress hides the test results; warnings and errors stay visible.
  const progress = vi.spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => progress.mockRestore());
});

