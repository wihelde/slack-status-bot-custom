/**
 * Source Adapter Interface
 * All source detectors implement this interface
 */

export interface SourceStatus {
  name: string;
  isActive: boolean;
  enabled?: boolean;
  title?: string;
  emoji?: string;
  message?: string;
}

export interface ISourceAdapter {
  /**
   * Get current status of this source
   */
  getStatus(): Promise<SourceStatus>;

  /**
   * Check if source is available on this platform
   */
  isAvailable(): boolean;

  /**
   * Enable/disable monitoring of this source
   */
  setEnabled(enabled: boolean): void;

  /**
   * Check if source is currently enabled
   */
  isEnabled(): boolean;
}

export interface DelegatingSourceAdapterConfig {
  name: string;
  isAvailable: () => boolean;
  getStatus: () => Promise<SourceStatus>;
}

export class DelegatingSourceAdapter implements ISourceAdapter {
  private enabled = true;

  constructor(private readonly config: DelegatingSourceAdapterConfig) {}

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return {
        name: this.config.name,
        isActive: false,
      };
    }

    return this.config.getStatus();
  }

  isAvailable(): boolean {
    return this.config.isAvailable();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}


