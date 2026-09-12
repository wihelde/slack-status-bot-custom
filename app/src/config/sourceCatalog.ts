import type { AppSourceSnapshot } from '../contracts/appSnapshot';

export type SourceName = 'spotify' | 'appleMusic' | 'youtubeMusic' | 'zoom' | 'teams' | 'huddle';

export interface SourceCatalogEntry {
  id: SourceName;
  displayName: string;
  icon: string;
}

export type SourceDisplayState = AppSourceSnapshot;

export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  { id: 'spotify', displayName: 'Spotify', icon: '🎵' },
  { id: 'appleMusic', displayName: 'Apple Music', icon: '🎶' },
  { id: 'youtubeMusic', displayName: 'YouTube Music', icon: '▶️' },
  { id: 'zoom', displayName: 'Zoom', icon: '📹' },
  { id: 'teams', displayName: 'Microsoft Teams', icon: '👥' },
  { id: 'huddle', displayName: 'Slack Huddle', icon: '🎧' },
];

export const DEFAULT_SOURCE_ORDER: SourceName[] = SOURCE_CATALOG.map(source => source.id);

export const MEETING_SOURCE_NAMES: SourceName[] = ['zoom', 'teams', 'huddle'];

export const SOURCE_LABELS: Record<SourceName, string> = SOURCE_CATALOG.reduce(
  (labels, source) => ({ ...labels, [source.id]: source.displayName }),
  {} as Record<SourceName, string>
);

export const SOURCE_ICONS: Record<SourceName, string> = SOURCE_CATALOG.reduce(
  (icons, source) => ({ ...icons, [source.id]: source.icon }),
  {} as Record<SourceName, string>
);

export function buildSourceDisplayStates(
  sourceStatuses?: Partial<Record<SourceName, { enabled?: boolean; isActive?: boolean; message?: string }>>
): SourceDisplayState[] {
  return SOURCE_CATALOG.map(source => ({
    name: source.id,
    enabled: sourceStatuses?.[source.id]?.enabled ?? true,
    isActive: sourceStatuses?.[source.id]?.isActive ?? false,
    message: sourceStatuses?.[source.id]?.message,
  }));
}
