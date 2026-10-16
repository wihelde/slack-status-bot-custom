import type { AppSnapshotRefreshReason, AppSnapshotRefreshSignal } from '../contracts/appSnapshot';
import { IPC_RENDERER_EVENTS } from '../contracts/ipc';

interface SnapshotBridgeDependencies {
  sendToRenderer: <TPayload = undefined>(
    channel: string,
    payload?: TPayload
  ) => void;
  logStatusBridgeInfo: (message: string, data?: unknown) => void;
}

export interface SnapshotBridge {
  emitAppSnapshotChanged: (reason?: AppSnapshotRefreshReason) => void;
  openHolidayModal: () => void;
}

export function createSnapshotBridge({
  sendToRenderer,
  logStatusBridgeInfo,
}: SnapshotBridgeDependencies): SnapshotBridge {
  function emitAppSnapshotChanged(reason: AppSnapshotRefreshReason = 'manual'): void {
    const signal: AppSnapshotRefreshSignal = { reason };
    logStatusBridgeInfo('Sending app snapshot refresh signal', signal);
    sendToRenderer(IPC_RENDERER_EVENTS.appSnapshotChanged, signal);
  }

  function openHolidayModal(): void {
    sendToRenderer(IPC_RENDERER_EVENTS.openHolidayModal);
  }

  return {
    emitAppSnapshotChanged,
    openHolidayModal,
  };
}
