import { createHash, randomBytes, randomUUID } from 'crypto';
import { buildSetupLink, parseSetupLink, SLACK_OAUTH_REDIRECT, type SlackRegistration } from '../contracts/setupLink';
import type { TokenVerification, WorkspaceConnections } from './workspaceConnections';

import type { ConnectionStep, RenewalStep } from './telemetryEvents';
import type { HostTelemetry } from './telemetry';
import { slackAuthorizationError, readSlackAuthorizationResponse } from './slackAuthorizationError';

interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  teamId?: string;
}

interface PendingAuthorization extends SlackRegistration {
  state: string;
  verifier: string;
  expiresAt: number;
  key: string;
  sequence: number;
  operationId: string;
  connectionRef: string;
  epoch: number | null;
  startedAt: number;
  flow: 'setup' | 'reconnect';
}

interface Options {
  connections: WorkspaceConnections;
  telemetry?: HostTelemetry;
  openExternal: (url: string) => Promise<void>;
  exchange: (request: { code: string; clientId: string; verifier: string }) => Promise<Credentials>;
  verify: (token: string) => Promise<TokenVerification>;
  refresh?: typeof refreshSlackToken;
  onConnected: () => Promise<void> | void;
  onResult?: (message: string) => void;
  onReconnectRequired?: (teamId: string) => void;
  onRenewalOutcome?: (teamId: string, outcome: 'renewed' | 'retrying' | 'reconnect-required') => void;
  now?: () => number;
}

class AuthorizationRequired extends Error {
  constructor(readonly response: ReturnType<typeof slackAuthorizationError>['response']) {
    super(response.data.error ?? 'Slack authorization required');
  }
}
class RenewalRetryAfter extends Error {
  constructor(readonly delayMs: number, readonly response: ReturnType<typeof slackAuthorizationError>['response']) {
    super(response.data.error ?? 'Slack token renewal rate limited');
  }
}

/** Owns in-memory PKCE attempts; only verified callback results reach the connection store. */
export class NativeSlackOAuth {
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly latest = new Map<string, string>();
  private readonly latestByClient = new Map<string, string>();
  private readonly latestCommittedByTeam = new Map<string, number>();
  private readonly removedThrough = new Map<string, number>();
  private renewalCycle: Promise<void> | null = null;
  private publishedTokens: string[];
  private sequence = 0;

  constructor(private readonly options: Options) {
    this.publishedTokens = options.connections.activeTokens(options.now?.() ?? Date.now());
  }

  async renewDue(): Promise<void> {
    if (this.renewalCycle) return this.renewalCycle;
    this.renewalCycle = (async () => {
      const telemetry = this.options.telemetry;
      const epoch = telemetry?.getCaptureEpoch() ?? null;
      const operation_id = randomUUID();
      const sensitive = this.options.connections.list().flatMap(entry =>
        [entry.teamId || '', entry.teamName || '', entry.userId || '', entry.userName || '']);
      const active = () => epoch !== null && epoch === telemetry?.getCaptureEpoch();
      let step = 'connection.credentials';
      try {
        const now = this.options.now?.() ?? Date.now();
        const due = this.options.connections.renewable(now);
        if (due.length && active()) telemetry?.recoverDiagnostic({ component: 'connection', step, operation_id });
        step = 'renewal';
        const changed = await Promise.all(due.map(connection => this.renewOne(connection)));
        step = 'connection.credentials';
        const nextTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
        if (nextTokens.length && active()) telemetry?.recoverDiagnostic({ component: 'connection', step, operation_id });
        if (changed.some(Boolean) || JSON.stringify(nextTokens) !== JSON.stringify(this.publishedTokens)) {
          step = 'connection.activate';
          await this.options.onConnected();
          this.publishedTokens = nextTokens;
          if (active()) telemetry?.recoverDiagnostic({ component: 'connection', step, operation_id });
        }
      } catch (error) {
        // Per-connection renewal failures were already reported before fallback/persistence handling.
        if (step !== 'renewal' && active()) telemetry?.reportDiagnostic(error, { component: 'connection', step, operation_id }, sensitive);
        throw error;
      }
    })().finally(() => { this.renewalCycle = null; });
    return this.renewalCycle;
  }

  private async renewOne(connection: ReturnType<WorkspaceConnections['renewable']>[number]): Promise<boolean> {
    const telemetry = this.options.telemetry;
    const epoch = telemetry?.getCaptureEpoch() ?? null;
    const operation_id = randomUUID();
    const connection_ref = this.options.connections.diagnosticReference(connection.teamId);
    const started = this.options.now?.() ?? Date.now();
    const identity = this.options.connections.list().find(entry => entry.teamId === connection.teamId);
    const sensitive = [connection.accessToken, connection.refreshToken, connection.clientId, connection.teamId,
      identity?.teamName || '', identity?.userId || '', identity?.userName || ''];
    const active = () => epoch !== null && epoch === telemetry?.getCaptureEpoch();
    const outcome = (result: 'renewed' | 'retrying' | 'reconnect_required', step: RenewalStep) => {
      if (active()) telemetry?.capture('connection_renewal', { operation_id, connection_ref, outcome: result, step,
        duration_ms: Math.max(0, (this.options.now?.() ?? Date.now()) - started) });
    };
    let step: RenewalStep = 'oauth.renew';
    try {
      const credentials = await (this.options.refresh ?? refreshSlackToken)(connection.clientId, connection.refreshToken);
      sensitive.push(credentials.accessToken, credentials.refreshToken, credentials.teamId || '');
      if (credentials.teamId && credentials.teamId !== connection.teamId) throw new Error('Slack renewal workspace identity mismatch');
      step = 'oauth.renew.persist';
      const replaced = this.options.connections.replaceRenewed(
        connection.teamId, connection.accessToken, connection.refreshToken, {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: (this.options.now?.() ?? Date.now()) + credentials.expiresIn * 1000,
      });
      if (replaced) {
        if (active()) for (const step of ['oauth.renew', 'oauth.renew.persist']) {
          telemetry?.recoverDiagnostic({ component: 'connection', step, operation_id, connection_ref });
        }
        outcome('renewed', step);
        this.options.onRenewalOutcome?.(connection.teamId, 'renewed');
      }
      return replaced;
    } catch (error) {
      if (active()) telemetry?.reportDiagnostic(error, { component: 'connection', step, operation_id, connection_ref, attempt: 1,
        duration_ms: Math.max(0, (this.options.now?.() ?? Date.now()) - started) }, sensitive);
      try {
        if (error instanceof AuthorizationRequired &&
          this.options.connections.markAuthorizationLost(connection.teamId, connection.accessToken, connection.refreshToken)) {
          outcome('reconnect_required', step);
          this.options.onRenewalOutcome?.(connection.teamId, 'reconnect-required');
          this.options.onReconnectRequired?.(connection.teamId);
          return true;
        } else if (!(error instanceof AuthorizationRequired)) {
          const nextRetryAt = (this.options.now?.() ?? Date.now()) +
            (error instanceof RenewalRetryAfter ? error.delayMs : 60_000);
          const changed = this.options.connections.markRenewalDelayed(
            connection.teamId, connection.accessToken, connection.refreshToken, nextRetryAt);
          outcome('retrying', step);
          this.options.onRenewalOutcome?.(connection.teamId, 'retrying');
          return changed;
        }
        return false;
      } catch (persistenceError) {
        if (active()) telemetry?.reportDiagnostic(persistenceError, { component: 'connection', step: 'oauth.renew.persist', operation_id, connection_ref }, sensitive);
        throw persistenceError;
      }
    }
  }

  async reconnect(teamId: string): Promise<void> {
    const clientId = this.options.connections.registrationFor(teamId);
    if (!clientId) throw new Error('Open the administrator Setup Link to reconnect this workspace');
    await this.start({ clientId, expectedTeamId: teamId }, 'reconnect');
  }

  removeWorkspace(teamId: string): boolean {
    const clientId = this.options.connections.registrationFor(teamId);
    const removed = this.options.connections.remove(teamId);
    if (removed) {
      this.publishedTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
      this.options.telemetry?.capture('workspace_removed', { remaining_workspaces: this.options.connections.list().length });
      this.removedThrough.set(teamId, ++this.sequence);
      for (const [state, attempt] of this.pending) {
        if (attempt.expectedTeamId === teamId || (!attempt.expectedTeamId && attempt.clientId === clientId)) {
          this.pending.delete(state);
          this.finish(attempt, 'cancelled', 'oauth.authorize', 'removed');
        }
      }
    }
    return removed;
  }

  async handleUrl(rawUrl: string): Promise<boolean> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { return false; }
    if (url.protocol !== 'slack-status-bot:') return false;
    if (url.hostname === 'connect') {
      const registration = parseSetupLink(rawUrl);
      this.options.telemetry?.capture('setup_input', { outcome: registration ? 'accepted' : 'rejected',
        reason: registration ? 'valid_link' : 'invalid_link', entry_point: 'app' });
      if (!registration) this.options.onResult?.('Invalid Setup Link');
      else await this.start(registration);
      return true;
    }
    if (url.hostname !== 'oauth') return false;
    await this.complete(url);
    return true;
  }

  private canCapture(attempt: Pick<PendingAuthorization, 'epoch'>): boolean {
    return attempt.epoch !== null && attempt.epoch === this.options.telemetry?.getCaptureEpoch();
  }

  private fail(attempt: PendingAuthorization, error: unknown, step: ConnectionStep, sensitive: readonly string[]): void {
    if (this.canCapture(attempt)) this.options.telemetry?.reportDiagnostic(error, { component: 'connection', step,
      operation_id: attempt.operationId, connection_ref: attempt.connectionRef, attempt: 1,
      duration_ms: Math.max(0, (this.options.now?.() ?? Date.now()) - attempt.startedAt) }, sensitive);
    this.finish(attempt, 'failed', step, 'technical_failure');
  }

  private recover(attempt: PendingAuthorization, step: string): void {
    if (this.canCapture(attempt)) this.options.telemetry?.recoverDiagnostic({ component: 'connection', step,
      operation_id: attempt.operationId, connection_ref: attempt.connectionRef });
  }

  private finish(attempt: PendingAuthorization, outcome: 'success' | 'failed' | 'cancelled', step: ConnectionStep,
    reason: 'connected' | 'technical_failure' | 'access_denied' | 'expired' | 'superseded' | 'removed' | 'invalid_callback',
    detail: { replaced_existing?: boolean; first_connection?: boolean } = {}): void {
    if (this.canCapture(attempt)) this.options.telemetry?.capture('connection_completed', {
      operation_id: attempt.operationId, connection_ref: attempt.connectionRef, flow: attempt.flow,
      outcome, step, reason, duration_ms: Math.max(0, (this.options.now?.() ?? Date.now()) - attempt.startedAt), ...detail,
    });
  }

  private async start(registration: SlackRegistration, flow: 'setup' | 'reconnect' = 'setup'): Promise<void> {
    buildSetupLink(registration);
    const key = registration.expectedTeamId || registration.clientId;
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const attempt: PendingAuthorization = {
      ...registration, state, verifier, key, sequence: ++this.sequence,
      flow, operationId: randomUUID(), connectionRef: this.options.connections.diagnosticReference(registration.expectedTeamId || `registration:${registration.clientId}`),
      epoch: this.options.telemetry?.getCaptureEpoch() ?? null, startedAt: this.options.now?.() ?? Date.now(),
      expiresAt: (this.options.now?.() ?? Date.now()) + 10 * 60_000,
    };
    for (const [oldState, previous] of this.pending) {
      if (previous.key === key || previous.clientId === registration.clientId) {
        this.pending.delete(oldState);
        this.finish(previous, 'cancelled', 'oauth.authorize', 'superseded');
      }
    }
    if (this.canCapture(attempt)) this.options.telemetry?.capture('connection_started', {
      operation_id: attempt.operationId, connection_ref: attempt.connectionRef, flow,
    });
    this.pending.set(state, attempt);
    this.latest.set(key, state);
    this.latestByClient.set(registration.clientId, state);
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', registration.clientId);
    url.searchParams.set('user_scope', 'users.profile:read,users.profile:write,users:write,dnd:write');
    url.searchParams.set('redirect_uri', SLACK_OAUTH_REDIRECT);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256');
    if (registration.expectedTeamId) url.searchParams.set('team', registration.expectedTeamId);
    try {
      await this.options.openExternal(url.toString());
      this.recover(attempt, 'oauth.browser');
      this.options.onResult?.('Complete Slack authorization in your browser');
    } catch (error) {
      this.pending.delete(state);
      this.fail(attempt, error, 'oauth.browser', [url.toString(), ...url.searchParams.values(), verifier]);
      this.options.onResult?.('Could not open the browser');
    }
  }

  private async complete(url: URL): Promise<void> {
    if ((url.pathname && url.pathname !== '/') || url.username || url.password || url.port || url.hash ||
      url.searchParams.getAll('state').length !== 1) {
      this.options.onResult?.('Unexpected Slack callback URL; authorization unchanged');
      return;
    }
    const state = url.searchParams.get('state') || '';
    const attempt = this.pending.get(state);
    if (!attempt) {
      this.options.onResult?.('No matching Slack authorization in this app; reopen the Setup Link');
      return;
    }
    this.pending.delete(state);
    if (attempt.expiresAt <= (this.options.now?.() ?? Date.now()) ||
      this.latest.get(attempt.key) !== state || this.latestByClient.get(attempt.clientId) !== state) {
      this.finish(attempt, 'cancelled', 'oauth.authorize', 'expired');
      this.options.onResult?.('Slack authorization expired; open the Setup Link again');
      return;
    }
    if (url.searchParams.has('error')) {
      if (url.searchParams.get('error') === 'access_denied') {
        this.finish(attempt, 'cancelled', 'oauth.authorize', 'access_denied');
      } else {
        const error = slackAuthorizationError(undefined, { error: url.searchParams.get('error') }, 'Slack authorization failed');
        this.fail(attempt, error, 'oauth.authorize', [attempt.state, attempt.verifier, attempt.clientId, url.toString()]);
      }
      this.options.onResult?.('Slack authorization was cancelled or denied');
      return;
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.getAll('code').length !== 1) {
      this.finish(attempt, 'failed', 'oauth.authorize', 'invalid_callback');
      this.options.onResult?.('Slack did not provide an authorization code; reopen the Setup Link');
      return;
    }
    this.recover(attempt, 'oauth.authorize');
    let step: ConnectionStep = 'oauth.exchange';
    const sensitive = [url.toString(), ...url.searchParams.values(), attempt.state, attempt.verifier, attempt.clientId, attempt.expectedTeamId || ''];
    try {
      const credentials = await this.options.exchange({
        code, clientId: attempt.clientId, verifier: attempt.verifier,
      });
      sensitive.push(credentials.accessToken, credentials.refreshToken, credentials.teamId || '');
      this.recover(attempt, step);
      step = 'oauth.verify';
      const identity = await this.options.verify(credentials.accessToken);
      if (identity.kind !== 'valid') throw identity.cause ?? new Error('Identity unavailable');
      sensitive.push(identity.teamId, identity.teamName, identity.userId, identity.userName);
      if (credentials.teamId && credentials.teamId !== identity.teamId) {
        this.fail(attempt, new Error('Slack workspace identity mismatch'), step, sensitive);
        this.options.onResult?.('Slack workspace identity did not match; connection unchanged');
        return;
      }
      if (attempt.expectedTeamId && identity.teamId !== attempt.expectedTeamId) {
        this.fail(attempt, new Error('Slack authorized a different workspace'), step, sensitive);
        this.options.onResult?.('Slack authorized a different workspace; connection unchanged');
        return;
      }
      if (this.latest.get(attempt.key) !== state || this.latestByClient.get(attempt.clientId) !== state ||
        (this.latestCommittedByTeam.get(identity.teamId) || 0) > attempt.sequence ||
        (this.removedThrough.get(identity.teamId) || 0) > attempt.sequence) {
        this.finish(attempt, 'cancelled', step, (this.removedThrough.get(identity.teamId) || 0) > attempt.sequence ? 'removed' : 'superseded');
        return;
      }
      this.recover(attempt, step);
      step = 'oauth.persist';
      const existing = this.options.connections.list();
      this.options.connections.upsertNative({
        ...credentials,
        clientId: attempt.clientId,
        expiresAt: (this.options.now?.() ?? Date.now()) + credentials.expiresIn * 1000,
        identity,
      });
      this.recover(attempt, step);
      this.recover(attempt, 'oauth.renew');
      this.finish(attempt, 'success', step, 'connected', {
        replaced_existing: existing.some(connection => connection.teamId === identity.teamId), first_connection: existing.length === 0,
      });
      this.latestCommittedByTeam.set(identity.teamId, attempt.sequence);
      this.options.onResult?.(`${identity.teamName} connected`);
      try {
        await this.options.onConnected();
        this.publishedTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
        this.recover(attempt, 'connection.activate');
      }
      catch (error) {
        if (this.canCapture(attempt)) this.options.telemetry?.reportDiagnostic(error, { component: 'connection',
          step: 'connection.activate', operation_id: attempt.operationId, connection_ref: attempt.connectionRef }, sensitive);
        this.options.onResult?.(`${identity.teamName} connected; status service could not restart`);
      }
    } catch (error) {
      this.fail(attempt, error, step, sensitive);
      this.options.onResult?.('Slack connection failed; existing workspaces are unchanged');
    }
  }
}

export async function exchangeSlackCode({ code, clientId, verifier }: {
  code: string; clientId: string; verifier: string;
}, request: typeof fetch = fetch): Promise<Credentials> {
  const body = new URLSearchParams({
    code, client_id: clientId, code_verifier: verifier,
    grant_type: 'authorization_code', redirect_uri: SLACK_OAUTH_REDIRECT,
  });
  const response = await request('https://slack.com/api/oauth.v2.access', {
    method: 'POST', body,
    signal: AbortSignal.timeout(10_000),
  });
  const data: unknown = await readSlackAuthorizationResponse(response);
  if (!response.ok) throw slackAuthorizationError(response, data, 'Slack token exchange failed');
  if (!data || typeof data !== 'object') throw slackAuthorizationError(response, {}, 'Invalid Slack token response');
  const result = data as Record<string, unknown>;
  const user = result.authed_user;
  if (result.ok !== true || !user || typeof user !== 'object') throw slackAuthorizationError(response, result, 'Slack token exchange failed');
  const account = user as Record<string, unknown>;
  if (account.token_type !== 'user' || typeof account.access_token !== 'string' ||
    typeof account.refresh_token !== 'string' || typeof account.expires_in !== 'number' ||
    account.expires_in <= 0) throw slackAuthorizationError(response, {}, 'Slack user credentials are incomplete');
  return {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresIn: account.expires_in,
    teamId: result.team && typeof result.team === 'object' &&
      typeof (result.team as Record<string, unknown>).id === 'string'
      ? (result.team as Record<string, string>).id : undefined,
  };
}

export async function refreshSlackToken(clientId: string, refreshToken: string, request: typeof fetch = fetch): Promise<Credentials> {
  const response = await request('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) {
    const failure = slackAuthorizationError(response, {}, 'Slack token renewal rate limited');
    const seconds = Number(response.headers?.get('Retry-After'));
    throw new RenewalRetryAfter(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000, failure.response);
  }
  const data: unknown = await readSlackAuthorizationResponse(response);
  const failure = slackAuthorizationError(response, data, 'Slack token renewal failed');
  if (!data || typeof data !== 'object') throw failure;
  const result = data as Record<string, unknown>;
  if (result.ok === false && result.error === 'ratelimited') {
    const seconds = Number(response.headers?.get('Retry-After'));
    throw new RenewalRetryAfter(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000, failure.response);
  }
  if (result.ok === false && ['invalid_refresh_token', 'token_revoked', 'account_inactive']
    .includes(String(result.error))) throw new AuthorizationRequired(failure.response);
  if (!response.ok) throw failure;
  if (result.ok !== true || result.token_type !== 'user' ||
    typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' ||
    typeof result.expires_in !== 'number' || result.expires_in <= 0) {
    throw failure;
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in,
    teamId: result.team && typeof result.team === 'object' &&
      typeof (result.team as Record<string, unknown>).id === 'string'
      ? (result.team as Record<string, string>).id : undefined,
  };
}
