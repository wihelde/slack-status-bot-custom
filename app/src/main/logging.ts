interface MainLoggerDependencies {
  app: {
    getPath: (name: 'userData') => string;
  };
  fs: {
    appendFileSync: (path: string, data: string, encoding: BufferEncoding) => void;
  };
  path: {
    join: (...parts: string[]) => string;
  };
  console?: Pick<Console, 'log' | 'error'>;
}

export interface MainLogger {
  log: (message: string) => void;
  logStatusBridgeInfo: (message: string, data?: unknown) => void;
  logStatusBridgeError: (message: string, error: unknown) => void;
}

export function createMainLogger({
  app,
  fs,
  path,
  console: runtimeConsole = console,
}: MainLoggerDependencies): MainLogger {
  const log = (message: string): void => {
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
