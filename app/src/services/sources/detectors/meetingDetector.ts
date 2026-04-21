import { SourceStatus } from '../sourceAdapter';

export interface MeetingDetectorDefinition {
  name: string;
  emoji?: string;
  activeMessage: string;
  isAvailable?: () => boolean;
  probe: () => Promise<boolean>;
}

export class MeetingDetector {
  constructor(private readonly definition: MeetingDetectorDefinition) {}

  async getStatus(): Promise<SourceStatus> {
    try {
      if (this.definition.isAvailable && !this.definition.isAvailable()) {
        return this.createInactiveStatus();
      }

      const isActive = await this.definition.probe();
      if (!isActive) {
        return this.createInactiveStatus();
      }

      return {
        name: this.definition.name,
        isActive: true,
        emoji: this.definition.emoji,
        message: this.definition.activeMessage,
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
      emoji: this.definition.emoji,
      message: undefined,
    };
  }
}
