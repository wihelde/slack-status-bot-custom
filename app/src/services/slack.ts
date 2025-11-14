import axios, { AxiosInstance } from 'axios';

export interface SlackProfile {
  status_emoji: string;
  status_text: string;
  huddle_state?: string;
}

export interface SlackUser {
  profile: SlackProfile;
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

      console.error('Slack API error:', response.data.error);
      return null;
    } catch (error) {
      console.error('Failed to get Slack profile:', error);
      return null;
    }
  }

  /**
   * Set user profile (status emoji and text)
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

    try {
      // Set for all configured tokens
      const results = await Promise.all(
        this.tokens.map(token =>
          this.axiosInstance.post('/users.profile.set', { profile }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
        )
      );

      const allOk = results.every(r => r.data.ok);
      
      if (!allOk) {
        const errors = results
          .filter(r => !r.data.ok)
          .map(r => r.data.error);
        console.error('Slack API errors:', errors);
      }

      return allOk;
    } catch (error) {
      console.error('Failed to set Slack profile:', error);
      return false;
    }
  }

  /**
   * Set user presence (auto/away)
   */
  async setPresence(presence: 'auto' | 'away'): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    try {
      const results = await Promise.all(
        this.tokens.map(token =>
          this.axiosInstance.post('/users.setPresence', { presence }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
        )
      );

      return results.every(r => r.data.ok);
    } catch (error) {
      console.error('Failed to set presence:', error);
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
      console.error('Failed to get presence:', error);
      return null;
    }
  }

  /**
   * Enable Do Not Disturb
   */
  async enableDND(minutes: number = 1440): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    try {
      console.log(`[DND] Enabling DND for ${minutes} minutes...`);
      const results = await Promise.all(
        this.tokens.map(token =>
          this.axiosInstance.post('/dnd.setSnooze', 
            { num_minutes: minutes },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
        )
      );

      const success = results.every(r => r.data.ok);
      console.log(`[DND] DND enabled successfully: ${success}`);
      console.log('[DND] Responses:', results.map(r => r.data));
      return success;
    } catch (error) {
      console.error('Failed to enable DND:', error);
      return false;
    }
  }

  /**
   * Disable Do Not Disturb
   */
  async disableDND(): Promise<boolean> {
    if (this.tokens.length === 0) {
      throw new Error('No Slack tokens configured');
    }

    try {
      const results = await Promise.all(
        this.tokens.map(token =>
          this.axiosInstance.post('/dnd.endDnd', {}, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
        )
      );

      return results.every(r => r.data.ok);
    } catch (error) {
      console.error('Failed to disable DND:', error);
      return false;
    }
  }
}

