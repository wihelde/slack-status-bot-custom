import { SlackProfile, SlackService } from './slack';

export interface SlackStatusChange {
  emoji: string;
  text: string;
  expiration?: number;
  presence?: 'auto' | 'away';
  dndAction?: 'enable' | 'disable' | 'ignore';
}

export class SlackStatusExecutor {
  constructor(private readonly slackService: SlackService) {}

  async getProfile(): Promise<SlackProfile | null> {
    return this.slackService.getProfile();
  }

  async applyStatusChange(change: SlackStatusChange): Promise<boolean> {
    const profileSuccess = await this.slackService.setProfile(
      change.emoji,
      change.text,
      change.expiration ?? 0
    );

    const presenceSuccess = change.presence ? await this.slackService.setPresence(change.presence) : true;

    let dndSuccess = true;
    if (change.dndAction === 'enable') {
      dndSuccess = await this.slackService.enableDND();
    } else if (change.dndAction === 'disable') {
      dndSuccess = await this.slackService.disableDND();
    }

    return profileSuccess && presenceSuccess && dndSuccess;
  }

  async setSourceStatus(emoji: string, text: string): Promise<boolean> {
    return this.slackService.setProfile(emoji, text);
  }

  async setMeetingDnd(enabled: boolean): Promise<boolean> {
    return enabled ? this.slackService.enableDND() : this.slackService.disableDND();
  }
}
