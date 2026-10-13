const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { app, safeStorage } = require('electron');
const { createAppConfigStore } = require('../dist/config/appConfigStore');
const { WorkspaceConnections } = require('../dist/main/workspaceConnections');
const { readAppleScriptOutput } = require('../dist/services/sources/probes/appleScriptProbe');
const { isMacProcessRunning, isMacApplicationRunning } = require('../dist/services/sources/probes/processProbe');
const { buildNowPlayingCommand } = require('../dist/services/sources/probes/nowPlayingProbe');
const { runCommand } = require('../dist/services/sources/probes/commandProbe');

const directory = process.argv[2];
if (process.platform !== 'darwin' || !directory) throw new Error('Run this through npm run macos:smoke');
app.setName('Slack Status Bot Native Checks');
app.setPath('userData', directory);

app.whenReady().then(async () => {
  assert.equal(await readAppleScriptOutput([`return "O'Reilly"`]), "O'Reilly");
  const helper = spawn('/bin/sleep', ['30']);
  await once(helper, 'spawn');
  try {
    assert.equal(await isMacProcessRunning('sleep'), true);
  } finally {
    const closed = once(helper, 'close');
    helper.kill();
    await closed;
  }
  assert.equal(await isMacApplicationRunning('SlackStatusBotMissingTestApplication'), false);

  // Execute the actual JXA/framework integration; the normal probe hides command failures.
  const nowPlaying = await runCommand(buildNowPlayingCommand());
  const metadata = JSON.parse(nowPlaying.stdout);
  assert.ok(metadata === null || (typeof metadata === 'object' && 'playbackRate' in metadata));

  const token = 'native-check-dummy-token';
  const config = createAppConfigStore({ configDir: directory });
  config.updateSlackTokens([token]);
  const options = {
    directory, config, encryption: safeStorage,
    verify: async () => ({ kind: 'valid', teamId: 'T-TEST', teamName: 'Test', userId: 'U-TEST', userName: 'Test' }),
  };
  const connections = new WorkspaceConnections(options);
  await connections.migrate();
  assert.deepEqual(config.load().slackTokens, []);
  assert.ok(!fs.readFileSync(path.join(directory, 'workspace-connections.json'), 'utf8').includes(token));
  assert.deepEqual(new WorkspaceConnections(options).activeTokens(), [token]);
  console.log('[macOS] Real AppleScript, process probes, MediaRemote and encrypted workspace storage passed.');
  app.exit(0);
}).catch(error => {
  console.error(error);
  app.exit(1);
});
