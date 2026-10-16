import { DEFAULT_SOURCE_ORDER, SourceName } from '../../config/sourceCatalog';
import { AppleMusicAdapter } from './appleMusic';
import { ZoomAdapter, TeamsAdapter, HuddleAdapter } from './meetings';
import { ISourceAdapter, SourceStatus } from './sourceAdapter';
import { SpotifyAdapter } from './spotify';
import { YouTubeMusicAdapter } from './youtubeMusic';

export type RegisteredSourceStatus = SourceStatus & { enabled: boolean };

export class SourceRegistry {
  private readonly adapters: Record<SourceName, ISourceAdapter>;

  constructor() {
    this.adapters = {
      spotify: new SpotifyAdapter(),
      appleMusic: new AppleMusicAdapter(),
      youtubeMusic: new YouTubeMusicAdapter(),
      zoom: new ZoomAdapter(),
      teams: new TeamsAdapter(),
      huddle: new HuddleAdapter(),
    };
  }

  getSourceNames(): SourceName[] {
    return [...DEFAULT_SOURCE_ORDER];
  }

  getAdapter(sourceName: SourceName): ISourceAdapter {
    return this.adapters[sourceName];
  }

  setEnabled(sourceName: SourceName, enabled: boolean): void {
    this.adapters[sourceName].setEnabled(enabled);
  }

  async getStatuses(): Promise<Record<SourceName, RegisteredSourceStatus>> {
    const statuses = await Promise.all(
      this.getSourceNames().map(async sourceName => {
        const status = await this.adapters[sourceName].getStatus();
        return [
          sourceName,
          {
            ...status,
            enabled: this.adapters[sourceName].isEnabled(),
          },
        ] as const;
      })
    );

    return Object.fromEntries(statuses) as Record<SourceName, RegisteredSourceStatus>;
  }

  applyEnabledConfig(config: Partial<Record<SourceName, boolean>>): void {
    for (const sourceName of this.getSourceNames()) {
      this.adapters[sourceName].setEnabled(config[sourceName] !== false);
    }
  }

  getEnabledConfig(): Record<SourceName, boolean> {
    return Object.fromEntries(
      this.getSourceNames().map(sourceName => [sourceName, this.adapters[sourceName].isEnabled()])
    ) as Record<SourceName, boolean>;
  }
}
