import { MEETING_SOURCE_NAMES, SourceName } from '../config/sourceCatalog';
import { logger } from '../utils/logger';
import { ArbitrationSnapshot, SourceArbitrationEngine, TrackedSourceChange } from './sources/sourceArbitrationEngine';
import { RegisteredSourceStatus } from './sources/sourceRegistry';
import { StatusManager } from './statusManager';
import { SlackStatusExecutor } from './slackStatusExecutor';

interface RuntimeOrchestratorConfig {
  statusManager: Pick<
    StatusManager,
    | 'markObservedSourceActive'
    | 'clearObservedSourceActive'
    | 'shouldApplyObservedStatus'
    | 'isStatusClean'
    | 'emitObservedStatusChange'
    | 'reset'
  >;
  slackExecutor: Pick<SlackStatusExecutor, 'getProfile' | 'setSourceStatus' | 'setMeetingDnd'>;
  sourceArbitrationEngine: Pick<SourceArbitrationEngine, 'listActiveSources' | 'pickWinner' | 'recordHandledStatus'>;
  isMeetingDndEnabled?: () => boolean;
  getNow?: () => number;
  profileSetCooldownMs?: number;
  resetBlockedCooldownMs?: number;
}

export interface RuntimePollingInput {
  sourceOrder: SourceName[];
  sourceStatuses: Record<SourceName, RegisteredSourceStatus>;
  snapshot: ArbitrationSnapshot;
}

export interface RuntimeReprioritizationInput {
  sourceOrder: SourceName[];
  sourceStatuses: Record<SourceName, RegisteredSourceStatus>;
}

export class RuntimeOrchestrator {
  private lastResetBlockedTime = 0;
  private lastProfileSetTime = 0;
  private readonly getNow: () => number;
  private readonly profileSetCooldownMs: number;
  private readonly resetBlockedCooldownMs: number;

  constructor(private readonly config: RuntimeOrchestratorConfig) {
    this.getNow = config.getNow ?? (() => Date.now());
    this.profileSetCooldownMs = config.profileSetCooldownMs ?? 2000;
    this.resetBlockedCooldownMs = config.resetBlockedCooldownMs ?? 30000;
  }

  async handlePollingSnapshot(input: RuntimePollingInput): Promise<void> {
    const { sourceOrder, sourceStatuses, snapshot } = input;
    let statusWasSet = false;

    for (const change of snapshot.changes) {
      const { sourceName, status, previous } = change;
      if (change.type === 'activated' || change.type === 'deactivated') {
        logger.debug(`[polling] ${sourceName} state changed: ${previous.wasActive} → ${change.status.isActive}`, {
          lastMessage: previous.lastMessage,
          newMessage: status.message,
        });
      } else if (change.type === 'message-changed') {
        logger.debug(`[polling] ${sourceName} message changed while active`, {
          lastMessage: previous.lastMessage,
          newMessage: status.message,
        });
      }

      if (
        snapshot.winningSource?.sourceName === sourceName &&
        (change.type === 'activated' || change.type === 'message-changed') &&
        !statusWasSet
      ) {
        statusWasSet = await this.applyWinningSourceChange(change, statusWasSet);
      } else if (change.type === 'deactivated') {
        await this.handleDeactivatedSource(sourceName, sourceStatuses, sourceOrder);
      }
    }
  }

  async handleReprioritization(input: RuntimeReprioritizationInput): Promise<void> {
    const { sourceOrder, sourceStatuses } = input;
    const winningSource = this.config.sourceArbitrationEngine.pickWinner(sourceOrder, sourceStatuses);

    if (winningSource?.status.message) {
      this.config.statusManager.markObservedSourceActive(winningSource.sourceName);

      const statusChanged = await this.config.statusManager.shouldApplyObservedStatus(
        winningSource.status.emoji || '',
        winningSource.status.message
      );

      if (statusChanged) {
        const applied = await this.tryApplyObservedStatus(
          winningSource.sourceName,
          winningSource.status.emoji || '',
          winningSource.status.message,
          'won after reprioritization'
        );

        if (applied) {
          this.config.sourceArbitrationEngine.recordHandledStatus(
            winningSource.sourceName,
            winningSource.status.message
          );
        }
        this.config.statusManager.emitObservedStatusChange(
          winningSource.status.emoji || '',
          winningSource.status.message,
          'activeSource'
        );
      }

      if (MEETING_SOURCE_NAMES.includes(winningSource.sourceName)) {
        await this.setMeetingDndIfAllowed(true);
      }

      return;
    }

    await this.tryResetWithoutWinner('reprioritization');
  }

  private async applyWinningSourceChange(
    change: TrackedSourceChange,
    statusWasSet: boolean
  ): Promise<boolean> {
    const { sourceName, status, type } = change;
    const emoji = status.emoji || '';
    const message = status.message || '';

    this.config.statusManager.markObservedSourceActive(sourceName);
    logger.debug(`[polling] Marked source as active in statusCheckState`, { activeSource: sourceName });

    const statusChanged = await this.config.statusManager.shouldApplyObservedStatus(emoji, message);
    if (statusChanged) {
      const applied = await this.tryApplyObservedStatus(
        sourceName,
        emoji,
        message,
        type === 'activated' ? 'became active' : 'message changed'
      );

      if (applied) {
        this.config.sourceArbitrationEngine.recordHandledStatus(sourceName, message);
        statusWasSet = true;
      }
      this.config.statusManager.emitObservedStatusChange(emoji, message, 'activeSource');
    } else {
      this.config.sourceArbitrationEngine.recordHandledStatus(sourceName, message);
      logger.debug(`[polling] ${sourceName} status unchanged or blocked, skipping API call`);
    }

    if (MEETING_SOURCE_NAMES.includes(sourceName) && type === 'activated') {
      logger.info(`[polling] ${sourceName} meeting started, ensuring DND is enabled...`);
      await this.setMeetingDndIfAllowed(true);
    }

    return statusWasSet;
  }

  private async handleDeactivatedSource(
    sourceName: SourceName,
    sourceStatuses: Record<SourceName, RegisteredSourceStatus>,
    sourceOrder: SourceName[]
  ): Promise<void> {
    logger.info(`[polling] ${sourceName} became inactive`);
    this.config.statusManager.clearObservedSourceActive(sourceName);
    logger.debug(`[polling] Cleared activeSource from statusCheckState`, { wasActive: sourceName });

    await this.syncMeetingDndAfterDeactivation(sourceName, sourceStatuses);

    const nextWinner = this.config.sourceArbitrationEngine.pickWinner(sourceOrder, sourceStatuses, {
      excludeSource: sourceName,
    });

    if (nextWinner && nextWinner.sourceName !== sourceName) {
      logger.info(`[polling] Switching status from ${sourceName} to ${nextWinner.sourceName}`);
      this.config.statusManager.markObservedSourceActive(nextWinner.sourceName);

      const emoji = nextWinner.status.emoji || '';
      const message = nextWinner.status.message || '';
      const statusChanged = await this.config.statusManager.shouldApplyObservedStatus(emoji, message);

      if (statusChanged) {
        const applied = await this.tryApplyObservedStatus(
          nextWinner.sourceName,
          emoji,
          message,
          `switching from ${sourceName}`
        );

        if (applied) {
          this.config.sourceArbitrationEngine.recordHandledStatus(nextWinner.sourceName, message);
        }
        this.config.statusManager.emitObservedStatusChange(emoji, message, 'activeSource');
      }

      return;
    }

    await this.tryResetAfterSourceDeactivation(sourceName);
  }

  private async syncMeetingDndAfterDeactivation(
    sourceName: SourceName,
    sourceStatuses: Record<SourceName, RegisteredSourceStatus>
  ): Promise<void> {
    if (!MEETING_SOURCE_NAMES.includes(sourceName)) {
      return;
    }

    const activeMeetings = this.config.sourceArbitrationEngine.listActiveSources(
      MEETING_SOURCE_NAMES,
      sourceStatuses,
      { excludeSource: sourceName }
    );

    if (activeMeetings.length > 0) {
      logger.info(
        `[polling] ${sourceName} meeting ended, but another meeting is active (${activeMeetings.join(', ')}), keeping DND enabled`
      );
      return;
    }

    logger.info(`[polling] ${sourceName} meeting ended and no other meetings active, disabling DND...`);
    await this.setMeetingDndIfAllowed(false);
  }

  private async setMeetingDndIfAllowed(enabled: boolean): Promise<void> {
    if (this.config.isMeetingDndEnabled?.() === false) return;
    if (!await this.config.statusManager.isStatusClean()) {
      logger.debug('[polling] Meeting DND unchanged because status is protected');
      return;
    }
    await this.config.slackExecutor.setMeetingDnd(enabled);
  }

  private async tryApplyObservedStatus(
    sourceName: SourceName,
    emoji: string,
    message: string,
    reason: string
  ): Promise<boolean> {
    const now = this.getNow();
    const timeSinceLastSet = now - this.lastProfileSetTime;

    if (timeSinceLastSet < this.profileSetCooldownMs) {
      const remainingCooldown = Math.ceil((this.profileSetCooldownMs - timeSinceLastSet) / 1000);
      logger.debug(`[polling] ${sourceName} status changed but rate limited (${remainingCooldown}s cooldown remaining)`, {
        emoji,
        message,
      });
      return false;
    }

    logger.info(`[polling] ${sourceName} ${reason}, setting status`, { emoji, message });
    const success = await this.config.slackExecutor.setSourceStatus(emoji, message);
    if (success) this.lastProfileSetTime = now;
    return success;
  }

  private async tryResetAfterSourceDeactivation(sourceName: SourceName): Promise<void> {
    const now = this.getNow();
    const timeSinceLastBlock = now - this.lastResetBlockedTime;
    const currentStatus = await this.config.slackExecutor.getProfile();

    if (currentStatus) {
      this.config.statusManager.emitObservedStatusChange(
        currentStatus.status_emoji,
        currentStatus.status_text,
        'sourceInactive'
      );
    }

    if (timeSinceLastBlock < this.resetBlockedCooldownMs) {
      const remainingCooldown = Math.ceil((this.resetBlockedCooldownMs - timeSinceLastBlock) / 1000);
      logger.debug(`[polling] Reset is blocked, cooldown active (${remainingCooldown}s remaining)`);
      return;
    }

    logger.info(`[polling] ${sourceName} became inactive, no other source active - attempting reset`);
    const resetSuccess = await this.config.statusManager.reset();
    if (resetSuccess) {
      logger.info(`[polling] Status reset successful after ${sourceName} deactivation`);
      this.lastResetBlockedTime = 0;
      return;
    }

    logger.warn(`[polling] Status reset failed after ${sourceName} deactivation (likely blocked by isStatusClean)`);
    this.lastResetBlockedTime = now;
  }

  private async tryResetWithoutWinner(reason: string): Promise<void> {
    const now = this.getNow();
    const timeSinceLastBlock = now - this.lastResetBlockedTime;

    if (timeSinceLastBlock < this.resetBlockedCooldownMs) {
      const remainingCooldown = Math.ceil((this.resetBlockedCooldownMs - timeSinceLastBlock) / 1000);
      logger.debug(`[polling] Reset is blocked, cooldown active (${remainingCooldown}s remaining)`, { reason });
      return;
    }

    const resetSuccess = await this.config.statusManager.reset();
    if (resetSuccess) {
      logger.info(`[polling] Status reset successful`, { reason });
      this.lastResetBlockedTime = 0;
      return;
    }

    logger.warn(`[polling] Status reset failed`, { reason });
    this.lastResetBlockedTime = now;
  }
}
