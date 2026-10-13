import { createRequire } from 'module';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const electronPath = process.argv[2] || require('electron');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-status-bot-smoke-'));
const userDataDir = path.join(tmpRoot, 'userData');
const debuggingPort = await findFreePort();
const stdout = [];
const stderr = [];
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

let electronProcess;
let electronClosed;
let webSocket;

try {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify(
      {
        slackTokens: [],
        hasCompletedFirstRun: true,
        logLevel: 'ERROR',
      },
      null,
      2
    ),
    'utf-8'
  );

  electronProcess = spawn(
    electronPath,
    [
      ...(process.argv[2] ? [] : [appDir]),
      // Chromium cannot use its sandbox when CI runs this test container as root.
      ...(process.platform === 'linux' && process.getuid() === 0 ? ['--no-sandbox'] : []),
    ],
    {
      cwd: appDir,
      env: {
        ...childEnv,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        SLACK_STATUS_BOT_REMOTE_DEBUGGING_PORT: String(debuggingPort),
        SLACK_STATUS_BOT_USER_DATA_DIR: userDataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  electronClosed = new Promise(resolve => {
    electronProcess.once('close', resolve);
  });
  electronProcess.once('error', error => stderr.push(error.message));

  collectOutput(electronProcess.stdout, stdout);
  collectOutput(electronProcess.stderr, stderr);

  electronProcess.once('exit', code => {
    if (code !== 0 && webSocket === undefined) {
      console.error(formatProcessOutput('Electron exited before the renderer was reachable.'));
    }
  });

  const target = await waitForRendererTarget(debuggingPort);
  const client = await connectToDevTools(target.webSocketDebuggerUrl);
  webSocket = client.webSocket;

  await client.send('Runtime.enable');
  const evaluation = await client.send('Runtime.evaluate', {
    expression: `(
      async () => {
        const api = window.electronAPI;
        if (!api) {
          return { hasElectronAPI: false };
        }

        const [snapshot, tokens] = await Promise.all([
          api.getAppSnapshot(),
          api.getTokens(),
        ]);
        const deadline = Date.now() + 5000;
        while (!document.querySelector('h1') && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const savedLevel = await api.setLogLevel('WARN');
        const level = await api.getLogLevel();

        return {
          hasElectronAPI: true,
          snapshotSuccess: snapshot?.success === true,
          tokensSuccess: tokens?.success === true,
          tokenCount: tokens?.data?.count ?? null,
          tokensConfigured: snapshot?.data?.setup?.tokensConfigured ?? null,
          daemonRunning: snapshot?.data?.daemon?.running ?? null,
          isFirstRun: snapshot?.data?.setup?.isFirstRun ?? null,
          renderedTitle: document.querySelector('h1')?.textContent,
          settingsRoundTrip: savedLevel?.success === true && level?.data === 'WARN',
        };
      }
    )()`,
    awaitPromise: true,
    returnByValue: true,
  });

  const smokeResult = evaluation.result?.value;

  assertEqual(smokeResult?.hasElectronAPI, true, 'window.electronAPI should be exposed');
  assertEqual(smokeResult?.snapshotSuccess, true, 'getAppSnapshot should resolve successfully');
  assertEqual(smokeResult?.tokensSuccess, true, 'getTokens should resolve successfully');
  assertEqual(smokeResult?.tokenCount, 0, 'isolated config should not contain tokens');
  assertEqual(smokeResult?.tokensConfigured, false, 'snapshot should report no configured tokens');
  assertEqual(smokeResult?.daemonRunning, false, 'daemon should stay stopped without tokens');
  assertEqual(smokeResult?.isFirstRun, false, 'seeded config should skip first-run state');
  assertEqual(smokeResult?.renderedTitle, 'Slack Status Bot', 'the built React UI should render');
  assertEqual(smokeResult?.settingsRoundTrip, true, 'settings should round-trip through preload and host IPC');
  assertEqual(JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8')).logLevel, 'WARN',
    'host IPC should persist settings in the isolated profile');

} catch (error) {
  console.error('[smoke] Electron renderer IPC smoke test failed.');
  console.error(error instanceof Error ? error.message : String(error));
  console.error(formatProcessOutput());
  process.exitCode = 1;
} finally {
  if (webSocket) {
    webSocket.close();
  }

  if (electronProcess) {
    // Wait for Chromium to stop writing its profile before deleting it.
    const killTimer = setTimeout(() => electronProcess.kill('SIGKILL'), 5000);
    electronProcess.kill();
    await electronClosed;
    clearTimeout(killTimer);
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

if (!process.exitCode) console.log('[smoke] Electron renderer, IPC and persisted settings passed.');

function collectOutput(stream, sink) {
  stream.setEncoding('utf-8');
  stream.on('data', chunk => {
    sink.push(chunk);
    while (sink.join('').length > 4000) {
      sink.shift();
    }
  });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function formatProcessOutput(prefix = '') {
  const output = [
    prefix,
    stdout.length > 0 ? `stdout:\n${stdout.join('')}` : '',
    stderr.length > 0 ? `stderr:\n${stderr.join('')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return output || 'No Electron process output captured.';
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }

        reject(new Error('Could not allocate a local debugging port.'));
      });
    });
    server.on('error', reject);
  });
}

async function waitForRendererTarget(port) {
  const deadline = Date.now() + 20000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      const pageTarget = targets.find(
        target => target.type === 'page' && target.webSocketDebuggerUrl
      );

      if (pageTarget) {
        return pageTarget;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for Electron renderer target.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
    }`
  );
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1000) });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function connectToDevTools(url) {
  const webSocket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    webSocket.addEventListener('open', resolve, { once: true });
    webSocket.addEventListener('error', reject, { once: true });
  });

  webSocket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);

    if (!request) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(message.error.message));
      return;
    }

    request.resolve(message.result);
  });
  webSocket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('Electron DevTools connection closed'));
    pending.clear();
  });

  return {
    webSocket,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Electron DevTools ${method} timed out`));
        }, 10000);
        pending.set(id, {
          resolve: result => { clearTimeout(timer); resolve(result); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
        webSocket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
