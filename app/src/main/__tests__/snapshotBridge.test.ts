import { describe, expect, it, vi } from 'vitest';
import { IPC_RENDERER_EVENTS } from '../../contracts/ipc';
import { createSnapshotBridge } from '../snapshotBridge';

describe('snapshotBridge', () => {
  it('emits the canonical app snapshot refresh signal with a reason payload', () => {
    const sendToRenderer = vi.fn();
    const logStatusBridgeInfo = vi.fn();
    const bridge = createSnapshotBridge({
      sendToRenderer,
      logStatusBridgeInfo,
    });

    bridge.emitAppSnapshotChanged('update');

    expect(logStatusBridgeInfo).toHaveBeenCalledWith('Sending app snapshot refresh signal', {
      reason: 'update',
    });
    expect(sendToRenderer).toHaveBeenCalledWith(IPC_RENDERER_EVENTS.appSnapshotChanged, {
      reason: 'update',
    });
  });

  it('routes holiday modal requests through the renderer boundary', () => {
    const sendToRenderer = vi.fn();
    const bridge = createSnapshotBridge({
      sendToRenderer,
      logStatusBridgeInfo: vi.fn(),
    });

    bridge.openHolidayModal();

    expect(sendToRenderer).toHaveBeenCalledWith(IPC_RENDERER_EVENTS.openHolidayModal);
  });
});
