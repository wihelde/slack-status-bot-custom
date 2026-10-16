export const SLACK_APP_SCHEME = 'slack-status-bot:';
export const SLACK_OAUTH_REDIRECT = 'slack-status-bot://oauth';

export interface SlackRegistration {
  clientId: string;
  expectedTeamId?: string;
}

export function buildSetupLink(registration: SlackRegistration): string {
  if (!/^\d+\.\d+$/.test(registration.clientId)) throw new Error('Invalid Slack client ID');
  if (registration.expectedTeamId && !/^T[A-Z0-9-]+$/.test(registration.expectedTeamId)) {
    throw new Error('Workspace ID must start with T; A identifies a Slack app');
  }
  const url = new URL('slack-status-bot://connect');
  url.searchParams.set('client_id', registration.clientId);
  if (registration.expectedTeamId) url.searchParams.set('team_id', registration.expectedTeamId);
  return url.toString();
}

export function parseSetupLink(rawUrl: string): SlackRegistration | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== SLACK_APP_SCHEME || url.hostname !== 'connect' || url.pathname ||
      url.username || url.password || url.port || url.hash ||
      [...url.searchParams.keys()].some(key => !['client_id', 'team_id'].includes(key)) ||
      url.searchParams.getAll('client_id').length !== 1 || url.searchParams.getAll('team_id').length > 1) return null;
    const clientId = url.searchParams.get('client_id') || '';
    const expectedTeamId = url.searchParams.get('team_id') || undefined;
    buildSetupLink({ clientId, expectedTeamId });
    return { clientId, expectedTeamId };
  } catch {
    return null;
  }
}
