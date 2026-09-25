import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOURCE_ORDER, SourceName } from '../../config/sourceCatalog';
import { RuntimeOrchestrator } from '../runtimeOrchestrator';
import { SourceArbitrationEngine } from '../sources/sourceArbitrationEngine';
import { RegisteredSourceStatus } from '../sources/sourceRegistry';

const createStatuses = (
  overrides: Partial<Record<SourceName, Partial<RegisteredSourceStatus>>> = {}
): Record<SourceName, RegisteredSourceStatus> => {
  const base: Record<SourceName, RegisteredSourceStatus> = {
    spotify: { name: 'Spotify', enabled: true, isActive: false, emoji: ':spotify:', message: '' },
    appleMusic: { name: 'Apple Music', enabled: true, isActive: false, emoji: ':apple:', message: '' },
    youtubeMusic: { name: 'YouTube Music', enabled: true, isActive: false, emoji: ':youtube-music:', message: '' },
    zoom: { name: 'Zoom', enabled: true, isActive: false, emoji: ':zoom:', message: '' },
    teams: { name: 'Teams', enabled: true, isActive: false, emoji: ':teams:', message: '' },
    huddle: { name: 'Huddle', enabled: true, isActive: false, emoji: ':huddle:', message: '' },
  };

  return Object.fromEntries(
    Object.entries(base).map(([sourceName, status]) => [
      sourceName,
      { ...status, ...overrides[sourceName as SourceName] },
    ])
  ) as Record<SourceName, RegisteredSourceStatus>;
};

describe('RuntimeOrchestrator', () => {
  const getNow = vi.fn();
  const statusManager = {
    markObservedSourceActive: vi.fn(),
    clearObservedSourceActive: vi.fn(),
    shouldApplyObservedStatus: vi.fn(),
    emitObservedStatusChange: vi.fn(),
    reset: vi.fn(),
  };
  const slackExecutor = {
    getProfile: vi.fn(),
    setSourceStatus: vi.fn(),
    setMeetingDnd: vi.fn(),
  };

  let sourceArbitrationEngine: SourceArbitrationEngine;
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    sourceArbitrationEngine = new SourceArbitrationEngine();
    orchestrator = new RuntimeOrchestrator({
      statusManager,
      slackExecutor,
      sourceArbitrationEngine,
      getNow,
    });

    getNow.mockReturnValue(100_000);
    statusManager.shouldApplyObservedStatus.mockResolvedValue(true);
    statusManager.reset.mockResolvedValue(true);
    slackExecutor.getProfile.mockResolvedValue({
      status_emoji: ':current:',
      status_text: 'Current status',
    });
    slackExecutor.setSourceStatus.mockResolvedValue(true);
    slackExecutor.setMeetingDnd.mockResolvedValue(true);
  });

  it('applies winning-source activation through the runtime boundary and enables meeting DND', async () => {
    const statuses = createStatuses({
      zoom: { isActive: true, message: 'In a meeting' },
    });
    const snapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, statuses);

    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: statuses,
      snapshot,
    });

    expect(statusManager.markObservedSourceActive).toHaveBeenCalledWith('zoom');
    expect(statusManager.shouldApplyObservedStatus).toHaveBeenCalledWith(':zoom:', 'In a meeting');
    expect(slackExecutor.setSourceStatus).toHaveBeenCalledWith(':zoom:', 'In a meeting');
    expect(statusManager.emitObservedStatusChange).toHaveBeenCalledWith(':zoom:', 'In a meeting', 'activeSource');
    expect(slackExecutor.setMeetingDnd).toHaveBeenCalledWith(true);
  });

  it('signals a partially delivered source status without recording it as fully handled', async () => {
    slackExecutor.setSourceStatus.mockResolvedValue(false);
    const recorded = vi.spyOn(sourceArbitrationEngine, 'recordHandledStatus');
    const statuses = createStatuses({ zoom: { isActive: true, message: 'In a meeting' } });
    const snapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, statuses);

    await orchestrator.handlePollingSnapshot({ sourceOrder: DEFAULT_SOURCE_ORDER, sourceStatuses: statuses, snapshot });

    expect(statusManager.emitObservedStatusChange).toHaveBeenCalledWith(':zoom:', 'In a meeting', 'activeSource');
    expect(recorded).not.toHaveBeenCalled();
  });

  it('switches to the fallback winner when the current winner deactivates', async () => {
    const initialStatuses = createStatuses({
      spotify: { isActive: true, message: 'Playing music' },
      zoom: { isActive: true, message: 'In a meeting' },
    });
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('spotify', 'Playing music');

    const nextStatuses = createStatuses({
      spotify: { isActive: false, message: '' },
      zoom: { isActive: true, message: 'In a meeting' },
    });
    const snapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, nextStatuses);

    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: nextStatuses,
      snapshot,
    });

    expect(statusManager.clearObservedSourceActive).toHaveBeenCalledWith('spotify');
    expect(statusManager.markObservedSourceActive).toHaveBeenCalledWith('zoom');
    expect(slackExecutor.setSourceStatus).toHaveBeenCalledWith(':zoom:', 'In a meeting');
    expect(statusManager.emitObservedStatusChange).toHaveBeenCalledWith(':zoom:', 'In a meeting', 'activeSource');
  });

  it('attempts a reset and emits sourceInactive when no fallback winner remains', async () => {
    const initialStatuses = createStatuses({
      spotify: { isActive: true, message: 'Playing music' },
    });
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('spotify', 'Playing music');

    const nextStatuses = createStatuses();
    const snapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, nextStatuses);

    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: nextStatuses,
      snapshot,
    });

    expect(statusManager.emitObservedStatusChange).toHaveBeenCalledWith(':current:', 'Current status', 'sourceInactive');
    expect(statusManager.reset).toHaveBeenCalledTimes(1);
    expect(slackExecutor.setSourceStatus).not.toHaveBeenCalled();
  });

  it('keeps meeting DND enabled when another meeting stays active after deactivation', async () => {
    const initialStatuses = createStatuses({
      zoom: { isActive: true, message: 'Zoom meeting' },
      teams: { isActive: true, message: 'Teams meeting' },
    });
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('zoom', 'Zoom meeting');

    const nextStatuses = createStatuses({
      zoom: { isActive: false, message: '' },
      teams: { isActive: true, message: 'Teams meeting' },
    });
    const snapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, nextStatuses);

    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: nextStatuses,
      snapshot,
    });

    expect(slackExecutor.setMeetingDnd).not.toHaveBeenCalledWith(false);
    expect(slackExecutor.setSourceStatus).toHaveBeenCalledWith(':teams:', 'Teams meeting');
  });

  it('applies reset cooldown after a blocked reset and retries after the cooldown window', async () => {
    const initialStatuses = createStatuses({
      spotify: { isActive: true, message: 'Playing music' },
    });
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('spotify', 'Playing music');

    statusManager.reset.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const inactiveStatuses = createStatuses();
    const firstSnapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, inactiveStatuses);
    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: inactiveStatuses,
      snapshot: firstSnapshot,
    });

    getNow.mockReturnValue(110_000);
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('spotify', 'Playing music');
    const blockedSnapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, inactiveStatuses);
    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: inactiveStatuses,
      snapshot: blockedSnapshot,
    });

    getNow.mockReturnValue(140_000);
    sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, initialStatuses);
    sourceArbitrationEngine.recordHandledStatus('spotify', 'Playing music');
    const retrySnapshot = sourceArbitrationEngine.evaluate(DEFAULT_SOURCE_ORDER, inactiveStatuses);
    await orchestrator.handlePollingSnapshot({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: inactiveStatuses,
      snapshot: retrySnapshot,
    });

    expect(statusManager.reset).toHaveBeenCalledTimes(2);
  });

  it('reuses the shared orchestration path when reprioritization picks a new winner', async () => {
    const statuses = createStatuses({
      spotify: { isActive: true, message: 'Playing music' },
      zoom: { isActive: true, message: 'In a meeting' },
    });

    await orchestrator.handleReprioritization({
      sourceOrder: ['zoom', 'spotify', 'teams', 'appleMusic', 'huddle'],
      sourceStatuses: statuses,
    });

    expect(statusManager.markObservedSourceActive).toHaveBeenCalledWith('zoom');
    expect(slackExecutor.setSourceStatus).toHaveBeenCalledWith(':zoom:', 'In a meeting');
    expect(statusManager.emitObservedStatusChange).toHaveBeenCalledWith(':zoom:', 'In a meeting', 'activeSource');
    expect(slackExecutor.setMeetingDnd).toHaveBeenCalledWith(true);
  });

  it('uses the shared reset path when reprioritization finds no active source', async () => {
    await orchestrator.handleReprioritization({
      sourceOrder: DEFAULT_SOURCE_ORDER,
      sourceStatuses: createStatuses(),
    });

    expect(statusManager.reset).toHaveBeenCalledTimes(1);
    expect(slackExecutor.setSourceStatus).not.toHaveBeenCalled();
  });
});
