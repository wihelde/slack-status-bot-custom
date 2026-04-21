import type { AutoLaunchStatusPayload } from '../contracts/ipc';

interface AutoLaunchAdapterDependencies {
  app: {
    setLoginItemSettings: (settings: { openAtLogin: boolean; openAsHidden: boolean }) => void;
    getLoginItemSettings: () => { openAtLogin: boolean };
  };
  fs: {
    existsSync: (path: string) => boolean;
    mkdirSync: (path: string, options: { recursive: boolean }) => void;
    writeFileSync: (path: string, data: string, encoding: BufferEncoding) => void;
    unlinkSync: (path: string) => void;
  };
  path: {
    join: (...parts: string[]) => string;
    dirname: (path: string) => string;
  };
  platform: NodeJS.Platform;
  homeDir: string;
  execSync: (command: string, options: { stdio: 'pipe' }) => void;
  processExecPath: string;
  log: (message: string) => void;
}

export interface AutoLaunchAdapter {
  getStatus: () => Promise<AutoLaunchStatusPayload>;
  setEnabled: (enabled: boolean) => Promise<AutoLaunchStatusPayload>;
}

export function createAutoLaunchAdapter({
  app,
  fs,
  path,
  platform,
  homeDir,
  execSync,
  processExecPath,
  log,
}: AutoLaunchAdapterDependencies): AutoLaunchAdapter {
  function getLaunchAgentPath(): string {
    return path.join(homeDir || '', 'Library/LaunchAgents/com.slack-status-bot.plist');
  }

  function getMacAppPath(): string {
    let appPath = processExecPath;
    const appMatch = appPath.match(/^(.+?\.app)/);
    if (appMatch) {
      appPath = appMatch[1];
    }
    return appPath;
  }

  async function setEnabled(enabled: boolean): Promise<AutoLaunchStatusPayload> {
    log(`[AutoLaunch] Setting auto-launch to: ${enabled}`);

    if (platform === 'darwin') {
      const launchAgentPath = getLaunchAgentPath();
      const appPath = getMacAppPath();

      if (enabled) {
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.slack-status-bot</string>
  <key>Program</key>
  <string>${appPath}/Contents/MacOS/Slack Status Bot</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${homeDir}/Library/Logs/slack-status-bot.log</string>
  <key>StandardErrorPath</key>
  <string>${homeDir}/Library/Logs/slack-status-bot-error.log</string>
</dict>
</plist>`;

        const launchAgentDir = path.dirname(launchAgentPath);
        if (!fs.existsSync(launchAgentDir)) {
          fs.mkdirSync(launchAgentDir, { recursive: true });
        }

        fs.writeFileSync(launchAgentPath, plistContent, 'utf-8');

        try {
          execSync(`launchctl load "${launchAgentPath}"`, { stdio: 'pipe' });
        } catch (error) {
          if (!String(error).includes('already loaded')) {
            const message = error instanceof Error ? error.message : String(error);
            log(`[AutoLaunch] Error loading with launchctl: ${message}`);
          }
        }
      } else if (fs.existsSync(launchAgentPath)) {
        try {
          execSync(`launchctl unload "${launchAgentPath}"`, { stdio: 'pipe' });
        } catch (error) {
          if (!String(error).includes('not loaded')) {
            const message = error instanceof Error ? error.message : String(error);
            log(`[AutoLaunch] Error unloading: ${message}`);
          }
        }

        fs.unlinkSync(launchAgentPath);
      }

      return { enabled };
    }

    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });

    return { enabled };
  }

  async function getStatus(): Promise<AutoLaunchStatusPayload> {
    if (platform === 'darwin') {
      return {
        enabled: fs.existsSync(getLaunchAgentPath()),
      };
    }

    const settings = app.getLoginItemSettings();
    return {
      enabled: settings.openAtLogin,
    };
  }

  return {
    getStatus,
    setEnabled,
  };
}
