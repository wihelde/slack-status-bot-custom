function createMainLogger({ app, fs, path, console: runtimeConsole = console }) {
  const log = (message) => {
    const logPath = path.join(app.getPath('userData'), 'tray-debug.log');
    const timestamp = new Date().toISOString();

    try {
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, 'utf-8');
    } catch (_error) {
      // Ignore logging errors in production wiring.
    }

    runtimeConsole.log(message);
  };

  return {
    log,
    logStatusBridgeInfo(message, data) {
      const suffix = data ? ` ${JSON.stringify(data)}` : '';
      log(`[StatusBridge] ${message}${suffix}`);
    },
    logStatusBridgeError(message, error) {
      const normalizedError = error instanceof Error ? error.message : String(error);
      runtimeConsole.error(`[StatusBridge] ${message}:`, error);
      log(`[StatusBridge] ${message}: ${normalizedError}`);
    },
  };
}

module.exports = {
  createMainLogger,
};
