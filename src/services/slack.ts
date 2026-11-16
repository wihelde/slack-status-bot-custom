import axios, { AxiosError, AxiosInstance, AxiosResponse, type AxiosRequestConfig, type AxiosAdapter } from 'axios';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { HostTelemetry } from '../main/telemetry';
import { telemetryEvents } from '../main/telemetryEvents';
import { z } from 'zod';

export type Operation = Omit<z.input<typeof telemetryEvents.status_operation>, 'outcome' | 'reason' | 'targeted_workspaces' | 'successful_workspaces' | 'duration_ms' | 'workspace_results' | 'operation_id'>;
type Step = 'users.profile.set' | 'users.setPresence' | 'dnd.setSnooze' | 'dnd.endDnd';
type Delivery = 'profile' | 'presence' | 'dnd';
type WorkspaceResult = z.output<typeof telemetryEvents.status_operation>['workspace_results'][number];
type OperationState = {
  id: string;
  epoch: number | null;
  results: Map<string, WorkspaceResult>;
  attempts: Map<string, number>;
  sensitive: Set<string>;
  context: Operation;
  skipReason?: 'protected' | 'unchanged' | 'cooldown' | 'priority' | 'missing_profile';
};
const operationStorage = new AsyncLocalStorage<OperationState>();
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
  private lastAutomaticSkip: string | undefined;
  private axiosInstance: AxiosInstance;
  private tokens: string[];
  private delivery: WorkspaceStatusSnapshot['delivery'][];
  private blockedReference: boolean[];
  private nextRetryAt: number[];
  private intendedProfile: { status_emoji: string; status_text: string; status_expiration: number } | null = null;
  private intendedPresence: 'auto' | 'away' | null = null;
  private intendedDnd: { action: 'enable'; until: number } | { action: 'disable' } | null = null;

  private connectionRefs: string[] = [];
  private intentOperations = new Map<Delivery, OperationState>();

  constructor(tokens: string | string[], private readonly telemetry?: HostTelemetry, adapter?: AxiosAdapter) {
    this.tokens = Array.isArray(tokens) ? tokens : [tokens];
    this.delivery = this.tokens.map(() => ({}));
    this.connectionRefs = this.tokens.map(() => randomUUID());
    this.blockedReference = this.tokens.map(() => false);
    this.nextRetryAt = this.tokens.map(() => 0);
    
    this.axiosInstance = axios.create({
      ...(adapter ? { adapter } : {}),
      timeout: 10000,
      baseURL: 'https://slack.com/api',
    });
  }

  reconfigure(tokens: string[], oldTeamIds: Array<string | null>, newTeamIds: Array<string | null>,
    referenceProfile: SlackProfile | null): void {
    this.refreshReferenceProfile(referenceProfile);
    const previous = this.tokens.map((token, index) => ({ token, teamId: oldTeamIds[index],
      ref: this.connectionRefs[index], delivery: this.delivery[index], nextRetryAt: this.nextRetryAt[index],
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
    this.connectionRefs = tokens.map((token, index) => previous.find(connection => connection.token === token &&
      (newTeamIds[index] ? connection.teamId === newTeamIds[index] : true))?.ref ?? randomUUID());
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
    this.intentOperations.clear();
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
          const response = await this.verifyProfile(tokenIndex, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }, attempt);

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
    this.rememberOperation('profile');

    logger.info(`[slack] setProfile called`, { emoji: statusEmoji, text: statusText, tokenCount: this.tokens.length });

    try {
      // Set profile sequentially for each token to avoid rate limiting
      const results: boolean[] = [];
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].profile = 'failed';
          this.recordBackoff(index, 'profile', 'users.profile.set');
          continue;
        }
        try {
          const response = await this.post(index, '/users.profile.set', { profile }, {
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
            const response = await this.verifyProfile(tokenIndex, {
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
              const retry = await this.post(tokenIndex, '/users.profile.set', { profile }, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
              this.recordRateLimit(tokenIndex, retry);
              this.delivery[tokenIndex].profile = retry.data.ok === true ? 'delivered' : 'failed';
              retriesOk &&= !!retry.data.ok;
            } catch (error) {
              this.recordRateLimit(tokenIndex, (error as AxiosError).response);
              this.delivery[tokenIndex].profile = 'failed';
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
          const response = await this.post(index, '/users.profile.set', { profile }, { headers });
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
          const response = await this.post(index, '/users.setPresence',
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
            const response = await this.post(index,
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

  /** Run one logical action; Slack requests and later catch-up share its ID without recounting usage. */
  async runOperation(context: Operation, work: () => Promise<boolean>, observation?: { id: string; epoch: number | null }): Promise<boolean> {
    const state: OperationState = { id: observation?.id ?? randomUUID(), epoch: observation ? observation.epoch : this.telemetry?.getCaptureEpoch() ?? null, results: new Map(), attempts: new Map(), sensitive: new Set(), context };
    const started = Date.now();
    let success = false;
    let unexpected = false;
    return operationStorage.run(state, async () => {
      try {
        success = await work();
        return success;
      } catch (error) {
        unexpected = true;
        if (state.epoch !== null && state.epoch === this.telemetry?.getCaptureEpoch()) this.telemetry?.reportDiagnostic(error, { ...context, component: 'runtime', step: 'status_operation', operation_id: state.id }, [...this.tokens, ...state.sensitive]);
        throw error; // Observing an exception does not change its existing fatal/nonfatal behavior.
      } finally {
        const workspaceResults = this.connectionRefs.map(connection_ref => state.results.get(connection_ref) ?? { connection_ref });
        const completed = workspaceResults.filter(result => Object.values(result).includes('success') &&
          !Object.values(result).includes('failed') && !Object.values(result).includes('skipped')).length;
        const attempted = state.results.size > 0;
        const { decision: _observation, source_changes: _changes, ...decisionContext } = context;
        const skipKey = !attempted && context.trigger !== 'manual' ? JSON.stringify({ epoch: state.epoch, ...decisionContext, reason: state.skipReason }) : undefined;
        const repeatedSkip = skipKey !== undefined && skipKey === this.lastAutomaticSkip;
        if (state.epoch !== null && state.epoch === this.telemetry?.getCaptureEpoch() && !repeatedSkip) this.telemetry.capture('status_operation', { ...context, operation_id: state.id,
          outcome: unexpected ? 'failed' : !attempted ? 'skipped' : completed === this.tokens.length && success ? 'success' :
            workspaceResults.some(result => Object.values(result).includes('success')) ? 'partial' : 'failed',
          reason: unexpected ? 'unexpected_error' : !this.tokens.length ? 'no_workspaces' : !attempted ? state.skipReason ?? (context.trigger === 'manual' ? 'invalid_action' : 'unchanged') :
            completed === this.tokens.length && success ? 'delivered' : 'delivery_failed',
          targeted_workspaces: attempted ? this.tokens.length : 0, successful_workspaces: completed,
          workspace_results: workspaceResults.map(result => ({ profile: 'skipped', presence: 'skipped', dnd: 'skipped', ...result })), duration_ms: Math.max(0, Date.now() - started),
        });
        if (context.trigger !== 'manual') this.lastAutomaticSkip = skipKey;
      }
    });
  }

  /** Attach a safe rule decision to the current logical operation. */
  recordDecision(reason: NonNullable<OperationState['skipReason']>, context: Partial<Operation> = {}): void {
    const operation = this.currentOperation();
    if (!operation) return;
    operation.skipReason = reason;
    Object.assign(operation.context, context, { rule_reason: reason });
  }

  private currentOperation(delivery?: Delivery) {
    const operation = operationStorage.getStore() ?? (delivery ? this.intentOperations.get(delivery) : undefined);
    if (operation?.epoch === null || operation?.epoch !== this.telemetry?.getCaptureEpoch()) return;
    return operation;
  }

  private rememberOperation(delivery: Delivery) {
    const operation = this.currentOperation();
    if (operation) this.intentOperations.set(delivery, operation);
    else this.intentOperations.delete(delivery);
  }

  private recordBackoff(index: number, delivery: Delivery, step: Step) {
    const scope = operationStorage.getStore();
    if (scope && (scope.epoch === null || scope.epoch !== this.telemetry?.getCaptureEpoch())) return;
    const operation = this.currentOperation(delivery);
    const connection_ref = this.connectionRefs[index];
    if (operation) operation.results.set(connection_ref, { ...operation.results.get(connection_ref), connection_ref, [delivery]: 'skipped' });
    this.telemetry?.capture('slack_request', { operation_id: operation?.id, connection_ref, step,
      result: 'skipped', attempt: operation?.attempts.get(`${connection_ref}:${step}`) ?? 0,
      duration_ms: 0, reason: 'rate_limit_backoff' });
  }

  private async verifyProfile(index: number, options: AxiosRequestConfig, attempt = 1) {
    const operation = this.currentOperation();
    const context = { ...operation?.context, component: 'slack' as const, step: 'users.profile.get',
      connection_ref: this.connectionRefs[index], operation_id: operation?.id, attempt };
    const started = Date.now();
    const scope = operationStorage.getStore();
    const epoch = scope ? scope.epoch : this.telemetry?.getCaptureEpoch();
    const canCapture = () => epoch != null && epoch === this.telemetry?.getCaptureEpoch();
    try {
      const response = await this.axiosInstance.get('/users.profile.get', options);
      if (canCapture() && response.data.ok === true) this.telemetry?.recoverDiagnostic(context);
      else if (canCapture()) this.telemetry?.reportDiagnostic({ response }, { ...context, duration_ms: Date.now() - started }, [...this.tokens, ...(operation?.sensitive ?? [])]);
      return response;
    } catch (error) {
      if (canCapture()) this.telemetry?.reportDiagnostic(error, { ...context, duration_ms: Date.now() - started }, [...this.tokens, ...(operation?.sensitive ?? [])]);
      throw error;
    }
  }

  private async post(index: number, url: `/${Step}`, body: unknown, options: AxiosRequestConfig) {
    const step = url.slice(1) as Step;
    const delivery: Delivery = step === 'users.profile.set' ? 'profile' : step === 'users.setPresence' ? 'presence' : 'dnd';
    const operation = this.currentOperation(delivery);
    const connection_ref = this.connectionRefs[index];
    const attemptKey = `${connection_ref}:${step}`;
    const attempt = (operation?.attempts.get(attemptKey) ?? 0) + 1;
    operation?.attempts.set(attemptKey, attempt);
    const started = Date.now();
    const context = { ...operation?.context, component: 'slack' as const, step, connection_ref, operation_id: operation?.id, attempt };
    const profile = z.object({ profile: z.object({ status_text: z.string(), status_emoji: z.string() }) }).safeParse(body);
    if (profile.success && operation) {
      operation.sensitive.add(profile.data.profile.status_text);
      operation.sensitive.add(profile.data.profile.status_emoji);
    }
    const sensitive = [...this.tokens, ...(operation?.sensitive ?? []),
      ...(profile.success ? [profile.data.profile.status_text, profile.data.profile.status_emoji] : [])];
    const scope = operationStorage.getStore();
    const epoch = scope ? scope.epoch : this.telemetry?.getCaptureEpoch();
    const canCapture = () => epoch != null && epoch === this.telemetry?.getCaptureEpoch();
    let ok = false;
    try {
      const response = await this.axiosInstance.post(url, body, options);
      ok = response.data.ok === true;
      if (canCapture() && ok) this.telemetry?.recoverDiagnostic(context);
      else if (canCapture()) this.telemetry?.reportDiagnostic({ response }, { ...context, duration_ms: Date.now() - started }, sensitive);
      return response;
    } catch (error) {
      if (canCapture()) this.telemetry?.reportDiagnostic(error, { ...context, duration_ms: Date.now() - started }, sensitive);
      throw error;
    } finally {
      const result = ok ? 'success' : 'failed';
      if (operation) {
        const previous = operation.results.get(connection_ref) ?? { connection_ref };
        operation.results.set(connection_ref, { ...previous, [delivery]: result });
      }
      if (canCapture()) this.telemetry?.capture('slack_request', { operation_id: operation?.id, connection_ref, step,
        result, attempt, duration_ms: Math.max(0, Date.now() - started), reason: ok ? 'delivered' : 'api_error' });
    }
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
    this.rememberOperation('presence');
    logger.info(`[slack] setPresence called`, { presence, tokenCount: this.tokens.length });

    try {
      const results: boolean[] = [];
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].presence = 'failed';
          this.recordBackoff(index, 'presence', 'users.setPresence');
          continue;
        }
        try {
          const response = await this.post(index, '/users.setPresence', { presence }, {
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
    this.rememberOperation('dnd');
    try {
      logger.info(`[slack] Enabling DND for ${minutes} minutes...`);
      const results: boolean[] = [];
      
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          this.recordBackoff(index, 'dnd', 'dnd.setSnooze');
          continue;
        }
        try {
          const response = await this.post(index, '/dnd.setSnooze',
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
    this.rememberOperation('dnd');
    try {
      const results: boolean[] = [];
      
      for (const [index, token] of this.tokens.entries()) {
        if (this.nextRetryAt[index] > Date.now()) {
          results.push(false);
          this.delivery[index].dnd = 'failed';
          this.recordBackoff(index, 'dnd', 'dnd.endDnd');
          continue;
        }
        try {
          const response = await this.post(index, '/dnd.endDnd', {}, {
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
