import { createHash, randomBytes } from 'crypto';
import { buildSetupLink, parseSetupLink, SLACK_OAUTH_REDIRECT, type SlackRegistration } from '../contracts/setupLink';
import type { TokenVerification, WorkspaceConnections } from './workspaceConnections';

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
}

interface Options {
  connections: WorkspaceConnections;
  openExternal: (url: string) => Promise<void>;
  exchange: (request: { code: string; clientId: string; verifier: string }) => Promise<Credentials>;
  verify: (token: string) => Promise<TokenVerification>;
  onConnected: () => Promise<void> | void;
  onResult?: (message: string) => void;
  onReconnectRequired?: (teamId: string) => void;
  onRenewalOutcome?: (teamId: string, outcome: 'renewed' | 'retrying' | 'reconnect-required') => void;
  now?: () => number;
}

class AuthorizationRequired extends Error {}
class RenewalRetryAfter extends Error {
  constructor(readonly delayMs: number) { super(); }
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
      const now = this.options.now?.() ?? Date.now();
      const changed = await Promise.all(this.options.connections.renewable(now).map(connection => this.renewOne(connection)));
      const nextTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
      if (changed.some(Boolean) || JSON.stringify(nextTokens) !== JSON.stringify(this.publishedTokens)) {
        await this.options.onConnected();
        this.publishedTokens = nextTokens;
      }
    })().finally(() => { this.renewalCycle = null; });
    return this.renewalCycle;
  }

  private async renewOne(connection: ReturnType<WorkspaceConnections['renewable']>[number]): Promise<boolean> {
    try {
      const credentials = await refreshSlackToken(connection.clientId, connection.refreshToken);
      if (credentials.teamId && credentials.teamId !== connection.teamId) return false;
      const replaced = this.options.connections.replaceRenewed(
        connection.teamId, connection.accessToken, connection.refreshToken, {
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        expiresAt: (this.options.now?.() ?? Date.now()) + credentials.expiresIn * 1000,
      });
      if (replaced) this.options.onRenewalOutcome?.(connection.teamId, 'renewed');
      return replaced;
    } catch (error) {
      if (error instanceof AuthorizationRequired &&
        this.options.connections.markAuthorizationLost(connection.teamId, connection.accessToken, connection.refreshToken)) {
        this.options.onRenewalOutcome?.(connection.teamId, 'reconnect-required');
        this.options.onReconnectRequired?.(connection.teamId);
        return true;
      } else if (!(error instanceof AuthorizationRequired)) {
        const nextRetryAt = (this.options.now?.() ?? Date.now()) +
          (error instanceof RenewalRetryAfter ? error.delayMs : 60_000);
        const changed = this.options.connections.markRenewalDelayed(
          connection.teamId, connection.accessToken, connection.refreshToken, nextRetryAt);
        this.options.onRenewalOutcome?.(connection.teamId, 'retrying');
        return changed;
      }
      return false;
    }
  }

  async reconnect(teamId: string): Promise<void> {
    const clientId = this.options.connections.registrationFor(teamId);
    if (!clientId) throw new Error('Open the administrator Setup Link to reconnect this workspace');
    await this.start({ clientId, expectedTeamId: teamId });
  }

  removeWorkspace(teamId: string): boolean {
    const clientId = this.options.connections.registrationFor(teamId);
    const removed = this.options.connections.remove(teamId);
    if (removed) {
      this.publishedTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
      this.removedThrough.set(teamId, ++this.sequence);
      for (const [state, attempt] of this.pending) {
        if (attempt.expectedTeamId === teamId || (!attempt.expectedTeamId && attempt.clientId === clientId)) {
          this.pending.delete(state);
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
      if (!registration) this.options.onResult?.('Invalid Setup Link');
      else await this.start(registration);
      return true;
    }
    if (url.hostname !== 'oauth') return false;
    await this.complete(url);
    return true;
  }

  private async start(registration: SlackRegistration): Promise<void> {
    buildSetupLink(registration);
    const key = registration.expectedTeamId || registration.clientId;
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const attempt: PendingAuthorization = {
      ...registration, state, verifier, key, sequence: ++this.sequence,
      expiresAt: (this.options.now?.() ?? Date.now()) + 10 * 60_000,
    };
    for (const [oldState, previous] of this.pending) {
      if (previous.key === key || previous.clientId === registration.clientId) this.pending.delete(oldState);
    }
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
      this.options.onResult?.('Complete Slack authorization in your browser');
    } catch {
      this.pending.delete(state);
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
      this.options.onResult?.('Slack authorization expired; open the Setup Link again');
      return;
    }
    if (url.searchParams.has('error')) {
      this.options.onResult?.('Slack authorization was cancelled or denied');
      return;
    }
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.getAll('code').length !== 1) {
      this.options.onResult?.('Slack did not provide an authorization code; reopen the Setup Link');
      return;
    }
    try {
      const credentials = await this.options.exchange({
        code, clientId: attempt.clientId, verifier: attempt.verifier,
      });
      const identity = await this.options.verify(credentials.accessToken);
      if (identity.kind !== 'valid') throw new Error('Identity unavailable');
      if (credentials.teamId && credentials.teamId !== identity.teamId) {
        this.options.onResult?.('Slack workspace identity did not match; connection unchanged');
        return;
      }
      if (attempt.expectedTeamId && identity.teamId !== attempt.expectedTeamId) {
        this.options.onResult?.('Slack authorized a different workspace; connection unchanged');
        return;
      }
      if (this.latest.get(attempt.key) !== state || this.latestByClient.get(attempt.clientId) !== state ||
        (this.latestCommittedByTeam.get(identity.teamId) || 0) > attempt.sequence ||
        (this.removedThrough.get(identity.teamId) || 0) > attempt.sequence) return;
      this.options.connections.upsertNative({
        ...credentials,
        clientId: attempt.clientId,
        expiresAt: (this.options.now?.() ?? Date.now()) + credentials.expiresIn * 1000,
        identity,
      });
      this.latestCommittedByTeam.set(identity.teamId, attempt.sequence);
      this.options.onResult?.(`${identity.teamName} connected`);
      try {
        await this.options.onConnected();
        this.publishedTokens = this.options.connections.activeTokens(this.options.now?.() ?? Date.now());
      }
      catch { this.options.onResult?.(`${identity.teamName} connected; status service could not restart`); }
    } catch {
      this.options.onResult?.('Slack connection failed; existing workspaces are unchanged');
    }
  }
}

export async function exchangeSlackCode({ code, clientId, verifier }: {
  code: string; clientId: string; verifier: string;
}): Promise<Credentials> {
  const body = new URLSearchParams({
    code, client_id: clientId, code_verifier: verifier,
    grant_type: 'authorization_code', redirect_uri: SLACK_OAUTH_REDIRECT,
  });
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST', body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Slack token exchange failed');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new Error('Invalid Slack token response');
  const result = data as Record<string, unknown>;
  const user = result.authed_user;
  if (result.ok !== true || !user || typeof user !== 'object') throw new Error('Slack token exchange failed');
  const account = user as Record<string, unknown>;
  if (account.token_type !== 'user' || typeof account.access_token !== 'string' ||
    typeof account.refresh_token !== 'string' || typeof account.expires_in !== 'number' ||
    account.expires_in <= 0) throw new Error('Slack user credentials are incomplete');
  return {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresIn: account.expires_in,
    teamId: result.team && typeof result.team === 'object' &&
      typeof (result.team as Record<string, unknown>).id === 'string'
      ? (result.team as Record<string, string>).id : undefined,
  };
}

export async function refreshSlackToken(clientId: string, refreshToken: string): Promise<Credentials> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    throw new RenewalRetryAfter(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000);
  }
  if (!response.ok) throw new Error('Slack token renewal failed');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') throw new Error('Slack token renewal failed');
  const result = data as Record<string, unknown>;
  if (result.ok === false && result.error === 'ratelimited') {
    const seconds = Number(response.headers.get('Retry-After'));
    throw new RenewalRetryAfter(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000);
  }
  if (result.ok === false && ['invalid_refresh_token', 'token_revoked', 'account_inactive']
    .includes(String(result.error))) throw new AuthorizationRequired();
  if (result.ok !== true || result.token_type !== 'user' ||
    typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' ||
    typeof result.expires_in !== 'number' || result.expires_in <= 0) {
    throw new Error('Slack token renewal failed');
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
