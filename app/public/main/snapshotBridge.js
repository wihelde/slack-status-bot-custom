function createSnapshotBridge({ sendToRenderer, logStatusBridgeInfo }) {
  function emitAppSnapshotChanged(reason = 'manual') {
    logStatusBridgeInfo('Sending app snapshot refresh signal', { reason });
    sendToRenderer('app-snapshot-changed', { reason });
  }

  function openHolidayModal() {
    sendToRenderer('open-holiday-modal');
  }

  return {
    emitAppSnapshotChanged,
    openHolidayModal,
  };
}

module.exports = {
  createSnapshotBridge,
};
