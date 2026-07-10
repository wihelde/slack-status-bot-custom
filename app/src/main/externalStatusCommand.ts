export const EXTERNAL_STATUS_PROTOCOL = 'slack-status-bot';

export type ExternalStatusCommand =
  | {
      type: 'set';
      emoji: string;
      text: string;
      presence: 'auto' | 'away';
    }
  | { type: 'online' }
  | { type: 'offline' };

export interface ExternalStatusCommandDaemon {
  setExternalStatus: (emoji: string, text: string, presence: 'auto' | 'away') => Promise<boolean>;
  goOnline: () => Promise<boolean>;
  goAway: () => Promise<boolean>;
}

export interface ExternalStatusCommandNotification {
  title: string;
  body: string;
}

function parsePresence(value: string | null): 'auto' | 'away' | null {
  if (!value) {
    return 'auto';
  }

  const normalized = value.trim().toLowerCase();
  if (['auto', 'active', 'online', 'present'].includes(normalized)) {
    return 'auto';
  }

  if (normalized === 'away') {
    return 'away';
  }

  return null;
}

export function parseExternalStatusCommand(rawUrl: string): ExternalStatusCommand | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch (_error) {
    return null;
  }

  if (url.protocol !== `${EXTERNAL_STATUS_PROTOCOL}:`) {
    return null;
  }

  const action = url.hostname || url.pathname.replace(/^\//, '');
  if (action === 'online') {
    return { type: 'online' };
  }

  if (action === 'offline') {
    return { type: 'offline' };
  }

  if (action !== 'set') {
    return null;
  }

  const emoji = url.searchParams.get('emoji')?.trim() || '';
  const text = url.searchParams.get('text')?.trim() || '';
  const presence = parsePresence(url.searchParams.get('presence'));
  if (!emoji || !text || !presence) {
    return null;
  }

  return {
    type: 'set',
    emoji,
    text,
    presence,
  };
}

function getSuccessNotification(command: ExternalStatusCommand): ExternalStatusCommandNotification {
  switch (command.type) {
    case 'online':
      return {
        title: 'Slack Status Bot',
        body: 'Status set: Online',
      };
    case 'offline':
      return {
        title: 'Slack Status Bot',
        body: 'Status set: Offline',
      };
    case 'set':
      return {
        title: 'Slack Status Bot',
        body: `Status set: ${command.emoji} ${command.text}`,
      };
  }
}

const failureNotification: ExternalStatusCommandNotification = {
  title: 'Slack Status Bot',
  body: 'Status could not be set',
};

export function createExternalStatusCommandHandler({
  getDaemon,
  log,
  notify,
}: {
  getDaemon: () => ExternalStatusCommandDaemon | null;
  log: (message: string) => void;
  notify?: (notification: ExternalStatusCommandNotification) => void;
}) {
  const pendingCommands: ExternalStatusCommand[] = [];

  const dispatch = async (command: ExternalStatusCommand): Promise<boolean> => {
    const daemon = getDaemon();
    if (!daemon) {
      pendingCommands.push(command);
      log('[ExternalStatusCommand] Queued command until daemon is ready');
      return true;
    }

    let success: boolean;
    try {
      success = command.type === 'online'
        ? await daemon.goOnline()
        : command.type === 'offline'
          ? await daemon.goAway()
          : await daemon.setExternalStatus(command.emoji, command.text, command.presence);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[ExternalStatusCommand] Command failed: ${message}`);
      notify?.(failureNotification);
      return false;
    }

    log(`[ExternalStatusCommand] Command result: ${success}`);
    notify?.(success ? getSuccessNotification(command) : failureNotification);
    return success;
  };

  const handleUrl = (rawUrl: string): boolean => {
    const command = parseExternalStatusCommand(rawUrl);
    if (!command) {
      return false;
    }

    void dispatch(command);
    return true;
  };

  const flushPending = async (): Promise<void> => {
    while (pendingCommands.length > 0 && getDaemon()) {
      const command = pendingCommands.shift();
      if (command) {
        await dispatch(command);
      }
    }
  };

  return {
    handleUrl,
    flushPending,
  };
}
