/**
 * IPC Service
 * Provides type-safe communication between React UI and Electron Main Process
 */

import { CustomStatusConfig } from '../config/statusConfig';

declare global {
  interface Window {
    electronAPI: {
      saveTokens: (tokens: string | string[]) => Promise<{ success: boolean; error?: string }>;
      getTokens: () => Promise<{ success: boolean; tokens?: string[]; count?: number; error?: string }>;
      deleteTokens: () => Promise<{ success: boolean; error?: string }>;
      getSlackStatus: () => Promise<{
        success: boolean;
        data?: {
          emoji: string;
          text: string;
          stateCheckValue: string;
        };
        error?: string;
      }>;
      getSourceStatuses: () => Promise<{
        success: boolean;
        data?: Record<string, any>;
        error?: string;
      }>;
      setStatus: (emoji: string, message: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
      goOnline: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
      goAway: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
      toggleSource: (source: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
      setSourceOrder: (sourceOrder: string[]) => Promise<{ success: boolean; error?: string }>;
      getSourceOrder: () => Promise<{ success: boolean; sourceOrder?: string[]; error?: string }>;
      getDaemonStatus: () => Promise<{
        success: boolean;
        data?: { running: boolean };
        error?: string;
      }>;
      getTokenStatus: () => Promise<{
        success: boolean;
        data?: { configured: boolean };
        error?: string;
      }>;
      onDaemonStatusChange: (callback: (data: any) => void) => () => void;
      onSourceStatusChange: (callback: (data: any) => void) => () => void;
      onSlackStatusChange: (callback: (data: any) => void) => () => void;
      getLogs: (lines?: number) => Promise<{ success: boolean; data?: string; error?: string }>;
      clearLogs: () => Promise<{ success: boolean; error?: string }>;
      setLogLevel: (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') => Promise<{ success: boolean; logLevel?: string; error?: string }>;
      getLogLevel: () => Promise<{ success: boolean; logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; error?: string }>;
      getStatusConfiguration: () => Promise<{ success: boolean; data?: CustomStatusConfig[]; error?: string }>;
      updateStatusConfiguration: (config: CustomStatusConfig[]) => Promise<{ success: boolean; error?: string }>;
      resetStatusConfiguration: () => Promise<{ success: boolean; error?: string }>;
      setHoliday: (returnDate: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
      onStatusChanged: (callback: (statusData: any) => void) => () => void;
      onOpenHolidayModal: (callback: () => void) => () => void;
      setAutoLaunch: (enabled: boolean) => Promise<{ success: boolean; verified?: boolean; error?: string }>;
      getAutoLaunch: () => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
      isFirstRun: () => Promise<{ success: boolean; isFirstRun?: boolean; error?: string }>;
      completeFirstRun: () => Promise<{ success: boolean; error?: string }>;
      onUpdateAvailable: (callback: (updateInfo: { version: string; releaseDate: string }) => void) => () => void;
      getUpdateAvailable: () => Promise<{ success: boolean; updateAvailable?: { version: string; releaseDate: string } | null; error?: string }>;
    };
  }
}

export class IPCService {
  /**
   * Check if running in Electron
   */
  static isElectron(): boolean {
    return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
  }

  /**
   * Save Slack tokens
   */
  static async saveTokens(tokens: string | string[]): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.saveTokens(tokens);
      return result.success;
    } catch (error) {
      console.error('Error saving tokens:', error);
      return false;
    }
  }

  /**
   * Get current Slack status
   */
  static async getSlackStatus() {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getSlackStatus();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Error getting Slack status:', error);
      return null;
    }
  }

  /**
   * Get status of all sources
   */
  static async getSourceStatuses() {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getSourceStatuses();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Error getting source statuses:', error);
      return null;
    }
  }

  /**
   * Set custom status
   */
  static async setStatus(emoji: string, message: string): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.setStatus(emoji, message);
      return result.success && result.data ? true : false;
    } catch (error) {
      console.error('Error setting status:', error);
      return false;
    }
  }

  /**
   * Go online
   */
  static async goOnline(): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.goOnline();
      return result.success && result.data ? true : false;
    } catch (error) {
      console.error('Error going online:', error);
      return false;
    }
  }

  /**
   * Go away
   */
  static async goAway(): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.goAway();
      return result.success && result.data ? true : false;
    } catch (error) {
      console.error('Error going away:', error);
      return false;
    }
  }

  /**
   * Toggle monitoring of a source
   */
  static async toggleSource(source: 'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle', enabled: boolean): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.toggleSource(source, enabled);
      return result.success;
    } catch (error) {
      console.error('Error toggling source:', error);
      return false;
    }
  }

  /**
   * Set source priority order
   */
  static async setSourceOrder(sourceOrder: string[]): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.setSourceOrder(sourceOrder);
      return result.success;
    } catch (error) {
      console.error('Error setting source order:', error);
      return false;
    }
  }

  /**
   * Get current source priority order
   */
  static async getSourceOrder(): Promise<string[] | null> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getSourceOrder();
      return result.success ? result.sourceOrder || [] : null;
    } catch (error) {
      console.error('Error getting source order:', error);
      return null;
    }
  }

  /**
   * Get daemon status
   */
  static async getDaemonStatus() {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getDaemonStatus();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Error getting daemon status:', error);
      return null;
    }
  }

  /**
   * Get stored tokens (masked for security)
   */
  static async getTokens() {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getTokens();
      return result.success ? { tokens: result.tokens || [], count: result.count || 0 } : null;
    } catch (error) {
      console.error('Error getting tokens:', error);
      return null;
    }
  }

  /**
   * Delete all tokens
   */
  static async deleteTokens(): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.deleteTokens();
      return result.success;
    } catch (error) {
      console.error('Error deleting tokens:', error);
      return false;
    }
  }

  /**
   * Check if tokens are configured
   */
  static async isConfigured(): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.getTokenStatus();
      return result.success && result.data?.configured ? true : false;
    } catch (error) {
      console.error('Error checking token status:', error);
      return false;
    }
  }

  /**
   * Listen for daemon status changes
   */
  static onDaemonStatusChange(callback: (data: any) => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onDaemonStatusChange(callback);
  }

  /**
   * Listen for source status changes
   */
  static onSourceStatusChange(callback: (data: any) => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onSourceStatusChange(callback);
  }

  /**
   * Listen for Slack status changes
   */
  static onSlackStatusChange(callback: (data: any) => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onSlackStatusChange(callback);
  }

  /**
   * Get recent logs
   */
  static async getLogs(lines: number = 200): Promise<string> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return '(Not running in Electron)';
    }
    try {
      const result = await window.electronAPI.getLogs(lines);
      if (result.success && result.data) {
        return result.data;
      } else {
        return `(Error: ${result.error || 'Unknown error'})`;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error fetching logs:', error);
      return `(Error fetching logs: ${errorMsg})`;
    }
  }

  /**
   * Clear logs
   */
  static async clearLogs(): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.clearLogs();
      return result.success;
    } catch (error) {
      console.error('Error clearing logs:', error);
      return false;
    }
  }

  /**
   * Set log level
   */
  static async setLogLevel(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR') {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.setLogLevel(level);
      return result.success ? result : null;
    } catch (error) {
      console.error('Error setting log level:', error);
      return null;
    }
  }

  /**
   * Get current log level
   */
  static async getLogLevel() {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getLogLevel();
      return result.success ? result : null;
    } catch (error) {
      console.error('Error getting log level:', error);
      return null;
    }
  }

  /**
   * Set holiday status with return date
   */
  static async setHoliday(returnDate: string): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.setHoliday(returnDate);
      return result.success && result.data ? true : false;
    } catch (error) {
      console.error('Error setting holiday:', error);
      return false;
    }
  }

  /**
   * Get status configuration
   */
  static async getStatusConfiguration(): Promise<CustomStatusConfig[] | null> {
    if (!this.isElectron()) {
      return null;
    }
    try {
      const result = await window.electronAPI.getStatusConfiguration();
      return result.success ? result.data || [] : null;
    } catch (error) {
      console.error('Error getting status configuration:', error);
      return null;
    }
  }

  /**
   * Update status configuration
   */
  static async updateStatusConfiguration(config: CustomStatusConfig[]): Promise<boolean> {
    if (!this.isElectron()) {
      return false;
    }
    try {
      const result = await window.electronAPI.updateStatusConfiguration(config);
      return result.success;
    } catch (error) {
      console.error('Error updating status configuration:', error);
      return false;
    }
  }

  /**
   * Reset status configuration to defaults
   */
  static async resetStatusConfiguration(): Promise<boolean> {
    if (!this.isElectron()) {
      return false;
    }
    try {
      const result = await window.electronAPI.resetStatusConfiguration();
      return result.success;
    } catch (error) {
      console.error('Error resetting status configuration:', error);
      return false;
    }
  }

  /**
   * Listen for status changes from daemon
   */
  static onStatusChanged(callback: (statusData: any) => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onStatusChanged(callback);
  }

  /**
   * Listen for open-holiday-modal event
   */
  static onOpenHolidayModal(callback: () => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onOpenHolidayModal(callback);
  }

  /**
   * Set auto-launch on startup
   */
  static async setAutoLaunch(enabled: boolean): Promise<boolean> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return false;
    }
    try {
      const result = await window.electronAPI.setAutoLaunch(enabled);
      return result.success;
    } catch (error) {
      console.error('Error setting auto-launch:', error);
      return false;
    }
  }

  /**
   * Get auto-launch status
   */
  static async getAutoLaunch(): Promise<boolean | null> {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return null;
    }
    try {
      const result = await window.electronAPI.getAutoLaunch();
      return result.success ? (result.enabled || false) : null;
    } catch (error) {
      console.error('Error getting auto-launch status:', error);
      return null;
    }
  }

  /**
   * Check if this is the first run
   */
  static async isFirstRun(): Promise<boolean> {
    if (!this.isElectron()) {
      return false;
    }
    try {
      const result = await window.electronAPI.isFirstRun();
      return result.success ? (result.isFirstRun || false) : false;
    } catch (error) {
      console.error('Error checking first run:', error);
      return false;
    }
  }

  /**
   * Mark first run as complete
   */
  static async completeFirstRun(): Promise<boolean> {
    if (!this.isElectron()) {
      return false;
    }
    try {
      const result = await window.electronAPI.completeFirstRun();
      return result.success;
    } catch (error) {
      console.error('Error completing first run:', error);
      return false;
    }
  }

  /**
   * Listen for update available event
   */
  static onUpdateAvailable(callback: (updateInfo: { version: string; releaseDate: string }) => void): (() => void) | undefined {
    if (!this.isElectron()) {
      console.warn('Not running in Electron');
      return;
    }
    return window.electronAPI.onUpdateAvailable(callback);
  }

  /**
   * Get current update availability status
   */
  static async getUpdateAvailable(): Promise<{ version: string; releaseDate: string } | null> {
    if (!this.isElectron()) {
      return null;
    }
    try {
      const result = await window.electronAPI.getUpdateAvailable();
      return result.success ? (result.updateAvailable ?? null) : null;
    } catch (error) {
      console.error('Error getting update status:', error);
      return null;
    }
  }
}
