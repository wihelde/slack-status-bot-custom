import { DEFAULT_SOURCE_ORDER, SourceName } from '../../config/sourceCatalog';
import { RegisteredSourceStatus } from './sourceRegistry';

export interface SourceTrackingState {
  wasActive: boolean;
  lastMessage: string;
}

export type SourceChangeType =
  | 'unchanged'
  | 'activated'
  | 'deactivated'
  | 'message-changed';

export interface SourceChange {
  sourceName: SourceName;
  type: SourceChangeType;
  status: RegisteredSourceStatus;
}

export interface TrackedSourceChange extends SourceChange {
  previous: SourceTrackingState;
}

export interface WinningSource {
  sourceName: SourceName;
  status: RegisteredSourceStatus;
}

export interface ArbitrationSnapshot {
  winningSource: WinningSource | null;
  activeSources: SourceName[];
  changes: TrackedSourceChange[];
  trackingState: Record<SourceName, SourceTrackingState>;
}

export class SourceArbitrationEngine {
  private trackingState: Record<SourceName, SourceTrackingState>;

  constructor(sourceNames: SourceName[] = DEFAULT_SOURCE_ORDER) {
    this.trackingState = this.createTrackingState(sourceNames);
  }

  resetTrackingState(sourceNames: SourceName[] = DEFAULT_SOURCE_ORDER): void {
    this.trackingState = this.createTrackingState(sourceNames);
  }

  getTrackingState(): Record<SourceName, SourceTrackingState> {
    return Object.fromEntries(
      Object.entries(this.trackingState).map(([sourceName, state]) => [
        sourceName,
        { ...state },
      ])
    ) as Record<SourceName, SourceTrackingState>;
  }

  recordHandledStatus(sourceName: SourceName, message: string): void {
    this.ensureTrackingState([sourceName]);
    this.trackingState[sourceName] = {
      ...this.trackingState[sourceName],
      lastMessage: message,
    };
  }

  evaluate(
    sourceOrder: SourceName[],
    statuses: Record<SourceName, RegisteredSourceStatus>
  ): ArbitrationSnapshot {
    this.ensureTrackingState(sourceOrder);

    const changes: TrackedSourceChange[] = [];

    for (const sourceName of sourceOrder) {
      const status = statuses[sourceName];
      if (!status) {
        continue;
      }

      const previous = { ...this.trackingState[sourceName] };
      const change = this.determineChange(sourceName, previous, status);

      if (change.type !== 'unchanged') {
        changes.push({
          ...change,
          previous,
        });
      }

      this.trackingState[sourceName] = {
        wasActive: this.isActive(status),
        lastMessage: this.isActive(status) ? previous.lastMessage : '',
      };
    }

    return {
      winningSource: this.pickWinner(sourceOrder, statuses),
      activeSources: this.listActiveSources(sourceOrder, statuses),
      changes,
      trackingState: this.getTrackingState(),
    };
  }

  listActiveSources(
    sourceOrder: SourceName[],
    statuses: Record<SourceName, RegisteredSourceStatus>,
    options?: { excludeSource?: SourceName }
  ): SourceName[] {
    return sourceOrder.filter(sourceName => {
      if (options?.excludeSource && sourceName === options.excludeSource) {
        return false;
      }

      return this.isActive(statuses[sourceName]);
    });
  }

  determineChange(
    sourceName: SourceName,
    previous: SourceTrackingState,
    status: RegisteredSourceStatus
  ): SourceChange {
    const isActive = this.isActive(status);
    const wasActive = previous.wasActive;
    const messageChanged =
      isActive &&
      wasActive &&
      !!status.message &&
      status.message !== previous.lastMessage;

    if (isActive !== wasActive) {
      return {
        sourceName,
        type: isActive ? 'activated' : 'deactivated',
        status,
      };
    }

    if (messageChanged) {
      return {
        sourceName,
        type: 'message-changed',
        status,
      };
    }

    return {
      sourceName,
      type: 'unchanged',
      status,
    };
  }

  pickWinner(
    sourceOrder: SourceName[],
    statuses: Record<SourceName, RegisteredSourceStatus>,
    options?: { excludeSource?: SourceName }
  ): WinningSource | null {
    for (const sourceName of sourceOrder) {
      if (options?.excludeSource && sourceName === options.excludeSource) {
        continue;
      }

      const status = statuses[sourceName];
      if (this.isActive(status)) {
        return { sourceName, status };
      }
    }

    return null;
  }

  private isActive(status?: RegisteredSourceStatus): boolean {
    return !!status?.enabled && !!status?.isActive;
  }

  private ensureTrackingState(sourceNames: SourceName[]): void {
    for (const sourceName of sourceNames) {
      if (!this.trackingState[sourceName]) {
        this.trackingState[sourceName] = { wasActive: false, lastMessage: '' };
      }
    }
  }

  private createTrackingState(sourceNames: SourceName[]): Record<SourceName, SourceTrackingState> {
    return Object.fromEntries(
      sourceNames.map(sourceName => [
        sourceName,
        { wasActive: false, lastMessage: '' },
      ])
    ) as Record<SourceName, SourceTrackingState>;
  }
}
