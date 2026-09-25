import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import type { WorkspaceStatusSnapshot } from '../contracts/appSnapshot';

export interface SlackProfile {
  status_emoji: string;
  status_text: string;
  huddle_state?: string;
  status_expiration?: number;
}

/**
 * Slack API Service
 * Handles all communication with Slack API
 */
export class SlackService {
  private axiosInstance: AxiosInstance;
  private tokens: string[];
  private delivery: WorkspaceStatusSnapshot['delivery'][];
  private blockedReference: boolean[];
  private nextRetryAt: number[];
  private intendedProfile: { status_emoji: string; status_text: string; status_expiration: number } | null = null;
  private intendedPresence: 'auto' | 'away' | null = null;
  private intendedDnd: { action: 'enable'; until: number } | { action: 'disable' } | null = null;

  constructor(tokens: string | string[]) {
    this.tokens = Array.isArray(tokens) ? tokens : [tokens];
    this.delivery = this.tokens.map(() => ({}));
    this.blockedReference = this.tokens.map(() => false);
    this.nextRetryAt = this.tokens.map(() => 0);
    
    this.axiosInstance = axios.create({
      timeout: 10000,
      baseURL: 'https://slack.com/api',
    });
  }

  reconfigure(tokens: string[], oldTeamIds: Array<string | null>, newTeamIds: Array<string | null>,
    referenceProfile: SlackProfile | null): void {
    this.refreshReferenceProfile(referenceProfile);
    const previous = this.tokens.map((token, index) => ({ token, teamId: oldTeamIds[index],
      delivery: this.delivery[index], nextRetryAt: this.nextRetryAt[index],
      blockedReference: this.blockedReference[index] }));
    this.blockedReference = tokens.map((token, index) => previous.find(connection => connection.token === token &&
      (newTeamIds[index] ? connection.teamId === newTeamIds[index] : true))?.blockedReference ?? previous.length > 0);
    this.nextRetryAt = tokens.map((token, index) => previous.find(connection => connection.token === token &&
      (newTeamIds[index] ? connection.teamId === newTeamIds[index] : true))?.nextRetryAt || 0);
    this.delivery = tokens.map((token, index) => {
      const same = previous.find(connection => connection.token === token &&
        (newTeamIds[index] ? connection.teamId === newTeamIds[index] : true));
      if (same) return same.delivery;
      return {
        ...(this.intendedProfile ? { profile: 'failed' as const } : {}),
        ...(this.intendedPresence ? { presence: 'failed' as const } : {}),
        ...(this.intendedDnd ? { dnd: 'failed' as const } : {}),
      };
    });
    this.tokens = tokens;
  }

  hasExpiredProfileIntent(): boolean {
    return Boolean(this.intendedProfile?.status_expiration &&
      this.intendedProfile.status_expiration <= Math.floor(Date.now() / 1000));
  }

  refreshReferenceProfile(referenceProfile: SlackProfile | null): void {
    if (this.hasExpiredProfileIntent()) {
      this.intendedProfile = null;
      this.intendedPresence = null;
    }
    if (!this.intendedProfile && referenceProfile &&
      (!referenceProfile.status_expiration || referenceProfile.status_expiration > Math.floor(Date.now() / 1000))) {
      this.intendedProfile = {
        status_emoji: referenceProfile.status_emoji,
        status_text: referenceProfile.status_text,
        status_expiration: referenceProfile.status_expiration || 0,
      };
    }
  }

  forgetIntendedStatus(): void {
    this.intendedProfile = null;
    this.intendedPresence = null;
    this.intendedDnd = null;
  }

  matchesIntendedProfile(profile: SlackProfile): boolean {
    return this.intendedProfile?.status_emoji === profile.status_emoji &&
      this.intendedProfile.status_text === profile.status_text;
  }

  async observeWorkspaces(): Promise<Array<Pick<WorkspaceStatusSnapshot, 'health' | 'profile' | 'delivery'>>> {
    return Promise.all(this.tokens.map(async (token, index) => {
      try {
        const response = await this.axiosInstance.get('/users.profile.get', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (response.data.ok === true && response.data.profile) {
          return { health: 'reachable' as const, profile: response.data.profile as SlackProfile,
            delivery: { ...this.delivery[index] } };
        }
      } catch {
        // A missing observation is unavailable, never inferred from another workspace.
      }
      return { health: 'unavailable' as const, profile: null, delivery: { ...this.delivery[index] } };
    }));
  }

  /**
   * Get current user profile (status emoji, status text)
   */
  async getProfile(): Promise<SlackProfile | null> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    for (const [tokenIndex, token] of this.tokens.entries()) {
      if (this.blockedReference[tokenIndex] || this.delivery[tokenIndex].profile === 'failed') continue;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await this.axiosInstance.get('/users.profile.get', {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.data.ok === true && response.data.profile) return response.data.profile;
          logger[attempt === 1 ? 'warn' : 'error']('[slack] getProfile API error', { tokenIndex, attempt });
        } catch {
          logger[attempt === 1 ? 'warn' : 'error']('[slack] getProfile failed', { tokenIndex, attempt });
        }
      }
    }

    return null;
  }

  /**
   * Set user profile (status emoji and text)
   * Sequential requests with delays to avoid rate limiting
   */
  async setProfile(statusEmoji: string, statusText: string, statusExpiration: number = 0): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    const profile = {
      status_emoji: statusEmoji,
      status_text: statusText,
      status_expiration: statusExpiration,
    };
    this.intendedProfile = profile;

    logger.info(`[slack] setProfile called`, { emoji: statusEmoji, text: statusText, tokenCount: this.tokens.length });

    try {
      // Set profile sequentially for each token to avoid rate limiting
      const results: boolean[] = [];
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].profile = 'failed';
          continue;
        }
        try {
          const response = await this.axiosInstance.post('/users.profile.set', { profile }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          results.push(response.data.ok === true);
          this.delivery[index].profile = response.data.ok === true ? 'delivered' : 'failed';
          if (response.data.ok === true) this.blockedReference[index] = false;
          this.recordRateLimit(index, response);
        } catch (error) {
          results.push(false);
          this.delivery[index].profile = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
          logger.warn('[slack] setProfile request failed', { tokenIndex: index });
        }
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const allOk = results.every(Boolean);
      
      if (!allOk) {
        logger.error('[slack] setProfile failed for some workspaces', {
          failedTokenIndexes: results.flatMap((ok, index) => ok ? [] : [index]),
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        let retriesOk = true;
        for (const [tokenIndex, token] of this.tokens.entries()) {
          let persisted = false;
          try {
            const response = await this.axiosInstance.get('/users.profile.get', {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            persisted = response.data.ok &&
              response.data.profile?.status_emoji === statusEmoji &&
              response.data.profile?.status_text === statusText;
          } catch {}
          if (!persisted) {
            logger.warn(`[slack] Profile did not persist, retrying`, { tokenIndex });
            try {
              const retry = await this.axiosInstance.post('/users.profile.set', { profile }, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
              retriesOk &&= !!retry.data.ok;
            } catch {
              retriesOk = false;
            }
          }
        }

        if (!retriesOk) {
          logger.error(`[slack] setProfile retry failed`);
          return false;
        }
        logger.info(`[slack] setProfile successful`);
      }

      return allOk;
    } catch (error) {
      logger.error(`[slack] setProfile failed`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async synchronizeMissed(): Promise<boolean> {
    const profile = this.intendedProfile;
    let attempted = false;
    for (const [index, token] of this.tokens.entries()) {
      if (this.nextRetryAt[index] > Date.now()) continue;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      if (profile && this.delivery[index].profile === 'failed' &&
        (profile.status_expiration === 0 || profile.status_expiration > Math.floor(Date.now() / 1000))) {
        attempted = true;
        try {
          const response = await this.axiosInstance.post('/users.profile.set', { profile }, { headers });
          this.delivery[index].profile = response.data.ok === true ? 'delivered' : 'failed';
          if (response.data.ok === true) this.blockedReference[index] = false;
          this.recordRateLimit(index, response);
        } catch (error) {
          this.delivery[index].profile = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
        }
      }
      if (this.nextRetryAt[index] > Date.now()) continue;
      if (this.intendedPresence && this.delivery[index].presence === 'failed') {
        attempted = true;
        try {
          const response = await this.axiosInstance.post('/users.setPresence',
            { presence: this.intendedPresence }, { headers });
          this.delivery[index].presence = response.data.ok === true ? 'delivered' : 'failed';
          this.recordRateLimit(index, response);
        } catch (error) {
          this.delivery[index].presence = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
        }
      }
      if (this.nextRetryAt[index] > Date.now()) continue;
      const dnd = this.intendedDnd;
      if (dnd && this.delivery[index].dnd === 'failed') {
        const remaining = dnd.action === 'enable' ? Math.ceil((dnd.until - Date.now()) / 60_000) : 0;
        if (dnd.action === 'disable' || remaining > 0) {
          attempted = true;
          try {
            const response = await this.axiosInstance.post(
              dnd.action === 'enable' ? '/dnd.setSnooze' : '/dnd.endDnd',
              dnd.action === 'enable' ? { num_minutes: remaining } : {}, { headers });
            this.delivery[index].dnd = response.data.ok === true ? 'delivered' : 'failed';
            this.recordRateLimit(index, response);
          } catch (error) {
            this.delivery[index].dnd = 'failed';
            this.recordRateLimit(index, (error as AxiosError).response);
          }
        }
      }
    }
    return attempted;
  }

  private recordRateLimit(index: number, response: AxiosResponse | undefined): void {
    if (!response || (response.status !== 429 && response.data?.error !== 'ratelimited')) return;
    const seconds = Number(response.headers?.['retry-after']);
    this.nextRetryAt[index] = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
  }

  /**
   * Set user presence (auto/away)
   * Sequential requests with delays to avoid rate limiting
   */
  async setPresence(presence: 'auto' | 'away'): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    this.intendedPresence = presence;
    logger.info(`[slack] setPresence called`, { presence, tokenCount: this.tokens.length });

    try {
      const results: boolean[] = [];
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].presence = 'failed';
          continue;
        }
        try {
          const response = await this.axiosInstance.post('/users.setPresence', { presence }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          results.push(response.data.ok === true);
          this.delivery[index].presence = response.data.ok === true ? 'delivered' : 'failed';
          this.recordRateLimit(index, response);
        } catch (error) {
          results.push(false);
          this.delivery[index].presence = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
          logger.warn('[slack] setPresence request failed', { tokenIndex: index });
        }
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const allOk = results.every(Boolean);
      if (allOk) {
        logger.info(`[slack] setPresence successful`);
      } else {
        logger.warn(`[slack] setPresence failed for some tokens`);
      }
      return allOk;
    } catch (error) {
      logger.error(`[slack] setPresence failed`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Get current user presence
   */
  async getPresence(): Promise<'auto' | 'away' | null> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    try {
      const response = await this.axiosInstance.get('/users.getPresence', {
        headers: {
          Authorization: `Bearer ${this.tokens[0]}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.ok && response.data.presence) {
        return response.data.presence;
      }

      return null;
    } catch (error) {
      logger.error('[slack] getPresence failed', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Enable Do Not Disturb
   * Sequential requests with delays to avoid rate limiting
   */
  async enableDND(minutes: number = 1440): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    this.intendedDnd = { action: 'enable', until: Date.now() + minutes * 60_000 };
    try {
      logger.info(`[slack] Enabling DND for ${minutes} minutes...`);
      const results: boolean[] = [];
      
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          continue;
        }
        try {
          const response = await this.axiosInstance.post('/dnd.setSnooze',
            { num_minutes: minutes }, { headers: { Authorization: `Bearer ${token}` } });
          results.push(response.data.ok === true);
          this.delivery[index].dnd = response.data.ok === true ? 'delivered' : 'failed';
          this.recordRateLimit(index, response);
        } catch (error) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
          logger.warn('[slack] enableDND request failed', { tokenIndex: index });
        }
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const success = results.every(Boolean);
      logger.info(`[slack] DND enabled: ${success}`);
      return success;
    } catch (error) {
      logger.error('[slack] enableDND failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Disable Do Not Disturb
   * Sequential requests with delays to avoid rate limiting
   */
  async disableDND(): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    this.intendedDnd = { action: 'disable' };
    try {
      const results: boolean[] = [];
      
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          continue;
        }
        try {
          const response = await this.axiosInstance.post('/dnd.endDnd', {}, {
            headers: { Authorization: `Bearer ${token}` },
          });
          results.push(response.data.ok === true);
          this.delivery[index].dnd = response.data.ok === true ? 'delivered' : 'failed';
          this.recordRateLimit(index, response);
        } catch (error) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          this.recordRateLimit(index, (error as AxiosError).response);
          logger.warn('[slack] disableDND request failed', { tokenIndex: index });
        }
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results.every(Boolean);
    } catch (error) {
      logger.error('[slack] disableDND failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
