import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FirstRunDialog from '../FirstRunDialog';
import { IPCService } from '../../services/ipcService';

// Mock IPCService
vi.mock('../../services/ipcService');

describe('FirstRunDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockIPCService = IPCService as any;
    mockIPCService.setAutoLaunch = vi.fn().mockResolvedValue(true);
    mockIPCService.completeFirstRun = vi.fn().mockResolvedValue(true);
  });

  it('should render the dialog with welcome message', () => {
    const onComplete = vi.fn();
    render(<FirstRunDialog onComplete={onComplete} />);

    expect(screen.getByText(/Welcome to Slack Status Bot/i)).toBeInTheDocument();
  });

  it('should render auto-launch checkbox', () => {
    const onComplete = vi.fn();
    render(<FirstRunDialog onComplete={onComplete} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('should render feature list', () => {
    const onComplete = vi.fn();
    render(<FirstRunDialog onComplete={onComplete} />);

    expect(screen.getByText(/Automatically update when you're listening to music/i)).toBeInTheDocument();
    expect(screen.getByText(/Set "In a meeting"/i)).toBeInTheDocument();
    expect(screen.getByText(/Day-based statuses/i)).toBeInTheDocument();
    expect(screen.getByText(/Smart auto-correction/i)).toBeInTheDocument();
  });

  it('should render Get Started button', () => {
    const onComplete = vi.fn();
    render(<FirstRunDialog onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: /Get Started/i });
    expect(button).toBeInTheDocument();
  });

  it('should handle checkbox toggle', () => {
    const onComplete = vi.fn();
    render(<FirstRunDialog onComplete={onComplete} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('should call setAutoLaunch when checkbox is enabled and Get Started is clicked', async () => {
    const onComplete = vi.fn();
    const mockIPCService = IPCService as any;

    render(<FirstRunDialog onComplete={onComplete} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const button = screen.getByRole('button', { name: /Get Started/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockIPCService.setAutoLaunch).toHaveBeenCalledWith(true);
    });
  });

  it('should call setAutoLaunch(false) when checkbox is not enabled', async () => {
    const onComplete = vi.fn();
    const mockIPCService = IPCService as any;

    render(<FirstRunDialog onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: /Get Started/i });
    fireEvent.click(button);

    await waitFor(() => {
      // Explicitly set auto-launch to false to ensure it's disabled
      expect(mockIPCService.setAutoLaunch).toHaveBeenCalledWith(false);
    });
  });

  it('should call completeFirstRun on Get Started', async () => {
    const onComplete = vi.fn();
    const mockIPCService = IPCService as any;

    render(<FirstRunDialog onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: /Get Started/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockIPCService.completeFirstRun).toHaveBeenCalled();
    });
  });

  it('should call onComplete callback after Get Started', async () => {
    const onComplete = vi.fn();

    render(<FirstRunDialog onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: /Get Started/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('should disable button while loading', async () => {
    const onComplete = vi.fn();
    const mockIPCService = IPCService as any;
    
    // Verzögere den resolve, um den loading state zu sehen
    mockIPCService.completeFirstRun = vi.fn(() => 
      new Promise(resolve => setTimeout(() => resolve(true), 100))
    );

    render(<FirstRunDialog onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: /Get Started/i }) as HTMLButtonElement;
    fireEvent.click(button);

    // Button sollte disabled sein während loading
    expect(button).toBeDisabled();

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
