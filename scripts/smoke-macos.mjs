import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('This check requires macOS');
const require = createRequire(import.meta.url);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-native-checks-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
try {
  execFileSync(require('electron'), [path.join(scripts, 'smoke-macos-native.cjs'), directory],
    { env, stdio: 'inherit', timeout: 30000 });
} finally {
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
