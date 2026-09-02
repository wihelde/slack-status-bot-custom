import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

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

  constructor(tokens: string | string[]) {
    this.tokens = Array.isArray(tokens) ? tokens : [tokens];
    
    this.axiosInstance = axios.create({
      timeout: 10000,
      baseURL: 'https://slack.com/api',
    });
  }

  /**
   * Get current user profile (status emoji, status text)
   */
  async getProfile(): Promise<SlackProfile | null> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.axiosInstance.get('/users.profile.get', {
          headers: {
            Authorization: `Bearer ${this.tokens[0]}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.data.ok && response.data.profile) {
          return response.data.profile;
        }

        logger[attempt === 1 ? 'warn' : 'error']('[slack] getProfile API error', {
          error: response.data.error,
          attempt,
        });
      } catch (error) {
        logger[attempt === 1 ? 'warn' : 'error']('[slack] getProfile failed', {
          error: error instanceof Error ? error.message : String(error),
          attempt,
        });
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

    logger.info(`[slack] setProfile called`, { emoji: statusEmoji, text: statusText, tokenCount: this.tokens.length });

    try {
      // Set profile sequentially for each token to avoid rate limiting
      const results = [];
      for (const token of this.tokens) {
        const response = await this.axiosInstance.post('/users.profile.set', { profile }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        results.push(response);
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const allOk = results.every(r => r.data.ok);
      
      if (!allOk) {
        const errors = results
          .filter(r => !r.data.ok)
          .map(r => r.data.error);
        logger.error(`[slack] setProfile API errors`, { errors });
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

  /**
   * Set user presence (auto/away)
   * Sequential requests with delays to avoid rate limiting
   */
  async setPresence(presence: 'auto' | 'away'): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    logger.info(`[slack] setPresence called`, { presence, tokenCount: this.tokens.length });

    try {
      const results = [];
      for (const token of this.tokens) {
        const response = await this.axiosInstance.post('/users.setPresence', { presence }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        results.push(response);
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const allOk = results.every(r => r.data.ok);
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

    try {
      logger.info(`[slack] Enabling DND for ${minutes} minutes...`);
      const results = [];
      
      for (const token of this.tokens) {
        const response = await this.axiosInstance.post('/dnd.setSnooze', 
          { num_minutes: minutes },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        results.push(response);
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const success = results.every(r => r.data.ok);
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

    try {
      const results = [];
      
      for (const token of this.tokens) {
        const response = await this.axiosInstance.post('/dnd.endDnd', {}, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        results.push(response);
        
        // Add delay between requests (100ms) to avoid rate limiting
        if (this.tokens.indexOf(token) < this.tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results.every(r => r.data.ok);
    } catch (error) {
      logger.error('[slack] disableDND failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
