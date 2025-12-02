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



