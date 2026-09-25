import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AppConfigStore } from '../config/appConfigStore';
import type { WorkspaceConnectionSummary } from '../contracts/ipc';

export type TokenVerification =
  | { kind: 'valid'; teamId: string; teamName: string; userId: string; userName: string }
  | { kind: 'invalid' }
  | { kind: 'retry' };

interface Encryption {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
  getSelectedStorageBackend?: () => string;
}

interface StoredConnection extends WorkspaceConnectionSummary {
  fingerprint: string;
  encryptedToken: string;
  encryptedRefreshToken?: string;
  clientId?: string;
  expiresAt?: number;
  nextRetryAt?: number;
  replacesExisting?: boolean;
}

export interface NativeConnectionInput {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  identity: Extract<TokenVerification, { kind: 'valid' }>;
}

interface RenewableConnection {
  teamId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
}

interface Options {
  directory: string;
  config: AppConfigStore;
  encryption: Encryption;
  verify: (token: string) => Promise<TokenVerification>;
}

const FILE_NAME = 'workspace-connections.json';

/** Owns encrypted legacy credentials and their workspace identity during migration. */
export class WorkspaceConnections {
  private entries: StoredConnection[];
  private readonly filePath: string;

  constructor(private readonly options: Options) {
    this.filePath = path.join(options.directory, FILE_NAME);
    this.entries = this.read();
  }

  async migrate(): Promise<void> {
    // Verify the existing encrypted copy before removing any legacy plaintext.
    this.activeTokens();
    const legacy = this.options.config.load().slackTokens;
    if (legacy.length > 0) {
      this.assertSecureStorage();
      const known = new Set(this.entries.map(entry => entry.fingerprint));
      for (const token of legacy) {
        const fingerprint = fingerprintToken(token);
        if (known.has(fingerprint)) continue;
        this.entries.push({
          fingerprint,
          encryptedToken: this.options.encryption.encryptString(token).toString('base64'),
          teamId: null,
          teamName: null,
          userId: null,
          userName: null,
          state: 'unverified',
        });
        known.add(fingerprint);
      }
      this.persist();
      // The encrypted copy is durable before the old plaintext list is removed.
      this.options.config.clearSlackTokens();
    }

    await this.verifyPending();
  }

  async addTokens(tokens: string[]): Promise<void> {
    this.assertSecureStorage();
    const known = new Set(this.entries.map(entry => entry.fingerprint));
    for (const token of tokens.map(value => value.trim()).filter(Boolean)) {
      const fingerprint = fingerprintToken(token);
      if (known.has(fingerprint)) continue;
      this.entries.push({
        fingerprint,
        encryptedToken: this.options.encryption.encryptString(token).toString('base64'),
        teamId: null,
        teamName: null,
        userId: null,
        userName: null,
        state: 'unverified',
        replacesExisting: true,
      });
      known.add(fingerprint);
    }
    this.persist();
    await this.verifyPending();
  }

  clearAll(): void {
    this.assertSecureStorage();
    this.entries = [];
    this.persist();
    this.options.config.clearSlackTokens();
  }

  remove(teamId: string): boolean {
    this.assertSecureStorage();
    const remaining = this.entries.filter(entry => entry.teamId !== teamId);
    if (remaining.length === this.entries.length) return false;
    this.entries = remaining;
    this.persist();
    return true;
  }

  upsertNative(input: NativeConnectionInput): void {
    this.assertSecureStorage();
    const entry: StoredConnection = {
      fingerprint: fingerprintToken(input.accessToken),
      encryptedToken: this.options.encryption.encryptString(input.accessToken).toString('base64'),
      encryptedRefreshToken: this.options.encryption.encryptString(input.refreshToken).toString('base64'),
      clientId: input.clientId,
      expiresAt: input.expiresAt,
      teamId: input.identity.teamId,
      teamName: input.identity.teamName,
      userId: input.identity.userId,
      userName: input.identity.userName,
      state: 'connected',
    };
    const index = this.entries.findIndex(candidate => candidate.teamId === entry.teamId);
    if (index < 0) this.entries.push(entry);
    else this.entries.splice(index, 1, entry);
    this.entries = this.entries.filter(candidate => candidate === entry || candidate.teamId !== entry.teamId);
    this.persist();
  }

  registrationFor(teamId: string): string | null {
    return this.entries.find(entry => entry.teamId === teamId)?.clientId || null;
  }

  renewable(now: number): RenewableConnection[] {
    this.assertSecureStorage();
    return this.entries.flatMap(entry => {
      if (entry.state !== 'connected' || !entry.teamId || !entry.clientId ||
        (entry.nextRetryAt !== undefined && entry.nextRetryAt > now) ||
        !entry.encryptedRefreshToken || !entry.expiresAt || entry.expiresAt > now + 60 * 60_000) return [];
      return [{
        teamId: entry.teamId,
        clientId: entry.clientId,
        accessToken: this.options.encryption.decryptString(Buffer.from(entry.encryptedToken, 'base64')),
        refreshToken: this.options.encryption.decryptString(Buffer.from(entry.encryptedRefreshToken, 'base64')),
      }];
    });
  }

  replaceRenewed(teamId: string, previousToken: string, previousRefreshToken: string, credentials: {
    accessToken: string; refreshToken: string; expiresAt: number;
  }): boolean {
    this.assertSecureStorage();
    const entry = this.entries.find(candidate => candidate.teamId === teamId);
    if (!entry || entry.fingerprint !== fingerprintToken(previousToken) || !entry.clientId ||
      !entry.encryptedRefreshToken ||
      this.options.encryption.decryptString(Buffer.from(entry.encryptedRefreshToken, 'base64')) !== previousRefreshToken ||
      !entry.teamName || !entry.userId || !entry.userName) return false;
    this.upsertNative({
      ...credentials,
      clientId: entry.clientId,
      identity: { kind: 'valid', teamId, teamName: entry.teamName, userId: entry.userId, userName: entry.userName },
    });
    return true;
  }

  markAuthorizationLost(teamId: string, previousToken: string, previousRefreshToken: string): boolean {
    this.assertSecureStorage();
    const entry = this.entries.find(candidate => candidate.teamId === teamId);
    if (!entry || entry.state !== 'connected' || entry.fingerprint !== fingerprintToken(previousToken) ||
      !entry.encryptedRefreshToken ||
      this.options.encryption.decryptString(Buffer.from(entry.encryptedRefreshToken, 'base64')) !== previousRefreshToken) return false;
    entry.state = 'auth-required';
    this.persist();
    return true;
  }

  markRenewalDelayed(teamId: string, previousToken: string, previousRefreshToken: string, nextRetryAt: number): boolean {
    this.assertSecureStorage();
    const entry = this.entries.find(candidate => candidate.teamId === teamId);
    if (!entry || entry.state !== 'connected' || entry.fingerprint !== fingerprintToken(previousToken) ||
      !entry.encryptedRefreshToken ||
      this.options.encryption.decryptString(Buffer.from(entry.encryptedRefreshToken, 'base64')) !== previousRefreshToken) return false;
    const newIssue = entry.refreshIssue !== 'temporary';
    entry.refreshIssue = 'temporary';
    entry.nextRetryAt = nextRetryAt;
    this.persist();
    return newIssue;
  }

  hasPendingVerification(): boolean {
    return this.entries.some(entry => entry.state === 'unverified');
  }

  list(): WorkspaceConnectionSummary[] {
    const seen = new Set<string>();
    return this.entries.filter(entry => {
      if (!entry.teamId || entry.state !== 'connected') return true;
      if (seen.has(entry.teamId)) return false;
      seen.add(entry.teamId);
      return true;
    }).map(({ teamId, teamName, userId, userName, state, clientId, refreshIssue }) => ({
      teamId, teamName, userId, userName, state, canReconnect: Boolean(clientId), refreshIssue,
    }));
  }

  activeTokens(now = Date.now()): string[] {
    return this.activeWorkspaceConnections(now).map(connection => connection.token);
  }

  activeWorkspaceConnections(now = Date.now()): Array<{
    token: string; teamId: string | null; teamName: string | null; userName: string | null;
  }> {
    this.assertSecureStorage();
    const seen = new Set<string>();
    return this.entries.flatMap(entry => {
      if (entry.state === 'invalid' || entry.state === 'auth-required' ||
        (entry.expiresAt !== undefined && entry.expiresAt <= now) ||
        (entry.state === 'unverified' && entry.replacesExisting)) return [];
      if (entry.teamId) {
        if (seen.has(entry.teamId)) return [];
        seen.add(entry.teamId);
      }
      return [{
        token: this.options.encryption.decryptString(Buffer.from(entry.encryptedToken, 'base64')),
        teamId: entry.teamId,
        teamName: entry.teamName,
        userName: entry.userName,
      }];
    });
  }

  private async verifyPending(): Promise<void> {
    this.assertSecureStorage();
    const pending = this.entries.filter(entry => entry.state === 'unverified');
    const results = await Promise.all(pending.map(async entry => {
      try {
        return await this.options.verify(
          this.options.encryption.decryptString(Buffer.from(entry.encryptedToken, 'base64'))
        );
      } catch {
        return { kind: 'retry' } as const;
      }
    }));
    let changed = false;
    for (const [index, entry] of pending.entries()) {
      const result = results[index];
      if (result.kind === 'retry') continue;
      if (result.kind === 'invalid') {
        entry.state = 'invalid';
      } else {
        entry.state = 'connected';
        entry.teamId = result.teamId;
        entry.teamName = result.teamName;
        entry.userId = result.userId;
        entry.userName = result.userName;
      }
      changed = true;
    }
    if (changed) {
      for (const entry of [...this.entries]) {
        if (!entry.replacesExisting || !entry.teamId || entry.state !== 'connected') continue;
        const priorIndex = this.entries.findIndex(candidate =>
          candidate !== entry && candidate.teamId === entry.teamId && candidate.state === 'connected'
        );
        if (priorIndex < 0) continue;
        this.entries = this.entries.filter(candidate =>
          candidate === entry || candidate.teamId !== entry.teamId || candidate.state !== 'connected'
        );
        this.entries.splice(this.entries.indexOf(entry), 1);
        this.entries.splice(priorIndex, 0, entry);
        entry.replacesExisting = false;
      }
      const nativeTeams = new Set(this.entries.filter(entry => entry.clientId && entry.teamId)
        .map(entry => entry.teamId));
      const seen = new Set<string>();
      this.entries = this.entries.filter(entry => {
        if (!entry.teamId || entry.state !== 'connected') return true;
        if (!entry.clientId && nativeTeams.has(entry.teamId)) return false;
        if (seen.has(entry.teamId)) return false;
        seen.add(entry.teamId);
        return true;
      });
      this.persist();
    }
  }

  private assertSecureStorage(): void {
    if (!this.options.encryption.isEncryptionAvailable() ||
      (process.platform === 'linux' && this.options.encryption.getSelectedStorageBackend?.() === 'basic_text')) {
      throw new Error('Secure storage unavailable');
    }
  }

  private read(): StoredConnection[] {
    if (!fs.existsSync(this.filePath)) return [];
    const value: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(value) || !value.every(isStoredConnection)) {
      throw new Error('Workspace connection data is unreadable');
    }
    return value;
  }

  private persist(): void {
    fs.mkdirSync(this.options.directory, { recursive: true });
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const file = fs.openSync(tempPath, 'wx', 0o600);
      try {
        fs.writeFileSync(file, JSON.stringify(this.entries));
        fs.fsyncSync(file);
      } finally {
        fs.closeSync(file);
      }
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      this.entries = this.read();
      throw error;
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}

export async function verifySlackToken(token: string): Promise<TokenVerification> {
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { kind: 'retry' };
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return { kind: 'retry' };
    const result = data as Record<string, unknown>;
    if (result.ok === false) {
      return ['invalid_auth', 'token_revoked', 'account_inactive', 'not_authed'].includes(String(result.error))
        ? { kind: 'invalid' }
        : { kind: 'retry' };
    }
    if (result.ok !== true || typeof result.team_id !== 'string' ||
      typeof result.user_id !== 'string') return { kind: 'retry' };
    return {
      kind: 'valid',
      teamId: result.team_id,
      teamName: typeof result.team === 'string' ? result.team : result.team_id,
      userId: result.user_id,
      userName: typeof result.user === 'string' ? result.user : result.user_id,
    };
  } catch {
    return { kind: 'retry' };
  }
}

function fingerprintToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isStoredConnection(value: unknown): value is StoredConnection {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.fingerprint === 'string' && typeof record.encryptedToken === 'string' &&
    (record.state === 'connected' || record.state === 'unverified' || record.state === 'invalid' ||
      record.state === 'auth-required') &&
    (record.teamId === null || typeof record.teamId === 'string') &&
    (record.teamName === null || typeof record.teamName === 'string') &&
    (record.userId === null || typeof record.userId === 'string') &&
    (record.userName === null || typeof record.userName === 'string') &&
    (record.encryptedRefreshToken === undefined || typeof record.encryptedRefreshToken === 'string') &&
    (record.clientId === undefined || typeof record.clientId === 'string') &&
    (record.expiresAt === undefined || typeof record.expiresAt === 'number') &&
    (record.nextRetryAt === undefined || typeof record.nextRetryAt === 'number') &&
    (record.replacesExisting === undefined || typeof record.replacesExisting === 'boolean') &&
    (record.refreshIssue === undefined || record.refreshIssue === 'temporary');
}
