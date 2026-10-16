import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build, Platform } = require('electron-builder');
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = require(path.join(appDir, 'package.json'));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-status-bot-package-'));
const installedElectron = path.join(appDir, 'node_modules', 'electron', 'dist');
const run = (script, args = []) => execFileSync(process.execPath,
  [path.join(appDir, 'scripts', script), ...args], { cwd: appDir, stdio: 'inherit' });

try {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Package smoke supports macOS and Linux');
  await build({
    targets: Platform.current().createTarget(process.platform === 'darwin' ? packageJson.build.mac.target : 'dir'),
    publish: 'never',
    config: {
      directories: { output }, mac: { identity: null },
      electronDist: fs.existsSync(installedElectron) ? installedElectron : undefined,
    },
  });
  const [directory] = fs.readdirSync(output).filter(name =>
    process.platform === 'darwin' ? /^mac(?:-|$)/.test(name) : /^linux.*-unpacked$/.test(name));
  if (!directory) throw new Error('Packaged app directory was not produced');
  const bundle = path.join(output, directory);
  const resources = process.platform === 'darwin'
    ? path.join(bundle, `${packageJson.build.productName}.app`, 'Contents', 'Resources')
    : path.join(bundle, 'resources');
  const executable = process.platform === 'darwin'
    ? path.join(resources, '..', 'MacOS', packageJson.build.productName)
    : path.join(bundle, packageJson.name);
  run('verify-electron-package.mjs', [path.join(resources, 'app.asar')]);
  const updateConfig = fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8');
  const updateUrl = packageJson.build.publish.url.replace('${version}', packageJson.version);
  if (!updateConfig.includes('provider: generic') || !updateConfig.includes(updateUrl)) {
    throw new Error('Packaged updater configuration does not point to the app release URL');
  }
  if (process.platform === 'darwin') {
    const infoPlist = path.join(resources, '..', 'Info.plist');
    const protocols = JSON.parse(execFileSync('/usr/bin/plutil',
      ['-extract', 'CFBundleURLTypes', 'json', '-o', '-', infoPlist], { encoding: 'utf8' }));
    if (!protocols.some(protocol => protocol.CFBundleURLSchemes.includes('slack-status-bot'))) {
      throw new Error('Packaged app does not register the external status URI scheme');
    }
    for (const target of packageJson.build.mac.target) {
      const artifact = fs.readdirSync(output).find(name => name.endsWith(`.${target}`));
      if (!artifact) throw new Error(`Missing macOS ${target} artifact`);
      execFileSync(target === 'dmg' ? '/usr/bin/hdiutil' : '/usr/bin/unzip',
        target === 'dmg' ? ['verify', path.join(output, artifact)] : ['-tq', path.join(output, artifact)],
        { stdio: 'inherit' });
    }
  }
  run('smoke-electron-renderer.mjs', [executable]);
  console.log('[package] Built app, updater metadata and packaged startup passed.');
} finally {
  fs.rmSync(output, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
