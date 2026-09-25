import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { IPCService } from '../services/ipcService';

vi.mock('../services/ipcService');
vi.mock('../pages/Dashboard', () => ({ default: () => <div>Dashboard content</div> }));
vi.mock('../pages/Settings', () => ({ default: () => <div>Settings content</div> }));

describe('App navigation', () => {
  it('starts the next page at the top after switching from scrolled content', async () => {
    vi.mocked(IPCService.getAppSnapshot).mockResolvedValue(null);
    vi.mocked(IPCService.getTokens).mockResolvedValue(null);
    vi.mocked(IPCService.onAppSnapshotChanged).mockReturnValue(() => {});
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });

    render(<App />);
    await screen.findByText('Dashboard content');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByText('Settings content')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
