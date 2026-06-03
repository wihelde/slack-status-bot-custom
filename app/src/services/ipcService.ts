/**
 * IPC Service
 * Provides type-safe communication between React UI and Electron Main Process
 */

import {
  AppSnapshot,
  AppSnapshotRefreshSignal,
} from '../contracts/appSnapshot';
import { ElectronAPI, RendererLogLevel } from '../contracts/ipc';
import { CustomStatusConfig } from '../config/statusConfig';
import { SourceName } from '../config/sourceCatalog';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function logRendererWarning(message: string): void {
  console.warn(`[IPCService] ${message}`);
}

function logRendererError(message: string, error: unknown): void {
  console.error(`[IPCService] ${message}`, error);
}

export class IPCService {
  private static getElectronAPI(): ElectronAPI | null {
    if (typeof window === 'undefined' || typeof window.electronAPI === 'undefined') {
      logRendererWarning('Not running in Electron');
      return null;
    }

    return window.electronAPI;
  }

  /**
   * Save Slack tokens
   */
  static async saveTokens(tokens: string | string[]): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.saveTokens(tokens);
      return result.success;
    } catch (error) {
      logRendererError('Error saving tokens', error);
      return false;
    }
  }

  /**
   * Get the consolidated app snapshot for renderer bootstrap.
   */
  static async getAppSnapshot(): Promise<AppSnapshot | null> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getAppSnapshot();
      return result.success ? result.data ?? null : null;
    } catch (error) {
      logRendererError('Error getting app snapshot', error);
      return null;
    }
  }

  /**
   * Listen for renderer-facing runtime changes that should be reloaded from the app snapshot.
   */
  static onAppSnapshotChanged(
    callback: (signal: AppSnapshotRefreshSignal) => void
  ): (() => void) | undefined {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return;
    }
    return electronAPI.onAppSnapshotChanged(callback);
  }

  /**
   * Set custom status
   */
  static async setStatus(emoji: string, message: string): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.setStatus(emoji, message);
      return result.success && result.data ? true : false;
    } catch (error) {
      logRendererError('Error setting status', error);
      return false;
    }
  }

  /**
   * Go online
   */
  static async goOnline(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.goOnline();
      return result.success && result.data ? true : false;
    } catch (error) {
      logRendererError('Error going online', error);
      return false;
    }
  }

  /**
   * Go away
   */
  static async goAway(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.goAway();
      return result.success && result.data ? true : false;
    } catch (error) {
      logRendererError('Error going away', error);
      return false;
    }
  }

  /**
   * Toggle monitoring of a source
   */
  static async toggleSource(source: 'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle', enabled: boolean): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.toggleSource(source, enabled);
      return result.success;
    } catch (error) {
      logRendererError('Error toggling source', error);
      return false;
    }
  }

  /**
   * Set source priority order
   */
  static async setSourceOrder(sourceOrder: string[]): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.setSourceOrder(sourceOrder as SourceName[]);
      return result.success;
    } catch (error) {
      logRendererError('Error setting source order', error);
      return false;
    }
  }

  /**
   * Get current source priority order
   */
  static async getSourceOrder(): Promise<string[] | null> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getSourceOrder();
      return result.success ? result.data || [] : null;
    } catch (error) {
      logRendererError('Error getting source order', error);
      return null;
    }
  }

  /**
   * Get stored tokens (masked for security)
   */
  static async getTokens() {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getTokens();
      return result.success ? { tokens: result.data?.tokens || [], count: result.data?.count || 0 } : null;
    } catch (error) {
      logRendererError('Error getting tokens', error);
      return null;
    }
  }

  /**
   * Delete all tokens
   */
  static async deleteTokens(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.deleteTokens();
      return result.success;
    } catch (error) {
      logRendererError('Error deleting tokens', error);
      return false;
    }
  }

  /**
   * Get recent logs
   */
  static async getLogs(lines: number = 200): Promise<string> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return '(Not running in Electron)';
    }
    try {
      const result = await electronAPI.getLogs(lines);
      if (result.success && result.data) {
        return result.data;
      } else {
        return `(Error: ${result.error || 'Unknown error'})`;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logRendererError('Error fetching logs', error);
      return `(Error fetching logs: ${errorMsg})`;
    }
  }

  /**
   * Clear logs
   */
  static async clearLogs(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.clearLogs();
      return result.success;
    } catch (error) {
      logRendererError('Error clearing logs', error);
      return false;
    }
  }

  /**
   * Set log level
   */
  static async setLogLevel(level: RendererLogLevel) {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.setLogLevel(level);
      return result.success ? { success: true, logLevel: result.data ?? level } : null;
    } catch (error) {
      logRendererError('Error setting log level', error);
      return null;
    }
  }

  /**
   * Get current log level
   */
  static async getLogLevel() {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getLogLevel();
      return result.success ? { success: true, logLevel: result.data } : null;
    } catch (error) {
      logRendererError('Error getting log level', error);
      return null;
    }
  }

  /**
   * Set holiday status with return date
   */
  static async setHoliday(returnDate: string): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.setHoliday(returnDate);
      return result.success && result.data ? true : false;
    } catch (error) {
      logRendererError('Error setting holiday', error);
      return false;
    }
  }

  /**
   * Get status configuration
   */
  static async getStatusConfiguration(): Promise<CustomStatusConfig[] | null> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getStatusConfiguration();
      return result.success ? result.data || [] : null;
    } catch (error) {
      logRendererError('Error getting status configuration', error);
      return null;
    }
  }

  /**
   * Update status configuration
   */
  static async updateStatusConfiguration(config: CustomStatusConfig[]): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.updateStatusConfiguration(config);
      return result.success;
    } catch (error) {
      logRendererError('Error updating status configuration', error);
      return false;
    }
  }

  /**
   * Reset status configuration to defaults
   */
  static async resetStatusConfiguration(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.resetStatusConfiguration();
      return result.success;
    } catch (error) {
      logRendererError('Error resetting status configuration', error);
      return false;
    }
  }

  /**
   * Listen for open-holiday-modal event
   */
  static onOpenHolidayModal(callback: () => void): (() => void) | undefined {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return;
    }
    return electronAPI.onOpenHolidayModal(callback);
  }

  /**
   * Set auto-launch on startup
   */
  static async setAutoLaunch(enabled: boolean): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.setAutoLaunch(enabled);
      return result.success;
    } catch (error) {
      logRendererError('Error setting auto-launch', error);
      return false;
    }
  }

  /**
   * Get auto-launch status
   */
  static async getAutoLaunch(): Promise<boolean | null> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return null;
    }
    try {
      const result = await electronAPI.getAutoLaunch();
      return result.success ? (result.data?.enabled || false) : null;
    } catch (error) {
      logRendererError('Error getting auto-launch status', error);
      return null;
    }
  }

  /**
   * Mark first run as complete
   */
  static async completeFirstRun(): Promise<boolean> {
    const electronAPI = this.getElectronAPI();
    if (!electronAPI) {
      return false;
    }
    try {
      const result = await electronAPI.completeFirstRun();
      return result.success;
    } catch (error) {
      logRendererError('Error completing first run', error);
      return false;
    }
  }

}
