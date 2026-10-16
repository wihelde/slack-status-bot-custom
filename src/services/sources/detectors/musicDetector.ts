import { SourceStatus } from '../sourceAdapter';

export interface MusicDetectorDefinition {
  name: string;
  emoji?: string;
  isAvailable: () => boolean;
  isRunning?: () => Promise<boolean>;
  getPlayerState: () => Promise<string>;
  getTrack: () => Promise<string | null>;
}

export class MusicDetector {
  constructor(private readonly definition: MusicDetectorDefinition) {}

  async getStatus(): Promise<SourceStatus> {
    try {
      if (!this.definition.isAvailable()) {
        return this.createInactiveStatus();
      }

      if (this.definition.isRunning) {
        const isRunning = await this.definition.isRunning();
        if (!isRunning) {
          return this.createInactiveStatus();
        }
      }

      const playerState = await this.definition.getPlayerState();
      if (playerState !== 'playing') {
        return this.createInactiveStatus();
      }

      const track = await this.definition.getTrack();
      if (!track) {
        return this.createInactiveStatus();
      }

      return {
        name: this.definition.name,
        isActive: true,
        title: track,
        emoji: this.definition.emoji,
        message: track,
      };
    } catch (error) {
      console.error(`Error getting ${this.definition.name} status:`, error);
      return this.createInactiveStatus();
    }
  }

  private createInactiveStatus(): SourceStatus {
    return {
      name: this.definition.name,
      isActive: false,
    };
  }
}
