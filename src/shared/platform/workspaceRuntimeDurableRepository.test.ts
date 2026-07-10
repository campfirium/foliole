import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { showAppRuntimeNotice } from '../ui/AppRuntimeNotice';

import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import {
  readPendingNodeOrder,
  readPendingReadingProgress,
  readPendingRelearnNodes,
  resetPendingDurableMutationsForTests,
  stagePendingNodeOrder
} from './workspacePendingDurableMutations';
import {
  replayPendingWorkspaceDurableMutations,
  saveWorkspaceReadingProgressNow,
  saveWorkspaceRelearnNode
} from './workspaceRuntimeDurableRepository';

vi.mock('../ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: vi.fn() }));
vi.mock('./runtime', () => ({ isDesktopRuntime: vi.fn() }));
vi.mock('./runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

const readingPayload = {
  activeNodeId: 'topic-1',
  nodeViewStates: [{ nodeId: 'topic-1', scrollTop: 12, selectionFrom: null, selectionTo: null }],
  source: 'close-flush' as const,
  updatedAt: '2026-07-10T10:00:00.000Z'
};

describe('workspace durable runtime repository', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetPendingDurableMutationsForTests();
    vi.clearAllMocks();
    vi.mocked(isDesktopRuntime).mockReturnValue(true);
  });

  it('keeps relearn pending when IPC rejects', async () => {
    const runtimeInvoke = vi.fn().mockRejectedValue(new Error('offline'));
    vi.mocked(getRuntimeInvoke).mockReturnValue(runtimeInvoke);

    expect(saveWorkspaceRelearnNode({ nodeId: 'item-1' })).toBe(true);
    await Promise.resolve();

    expect(runtimeInvoke).toHaveBeenCalledWith(NATIVE_COMMANDS.relearnNode, { nodeId: 'item-1' });
    expect(readPendingRelearnNodes()).toHaveLength(1);
  });

  it('keeps close-flush reading progress pending when IPC rejects', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockRejectedValue(new Error('offline')));

    await expect(saveWorkspaceReadingProgressNow(readingPayload)).resolves.toBeUndefined();

    expect(readPendingReadingProgress()?.payload).toEqual(readingPayload);
  });

  it('replays and clears pending entries after runtime recovers', async () => {
    stagePendingNodeOrder(['topic-2', 'topic-1']);
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(null));

    await replayPendingWorkspaceDurableMutations();

    expect(readPendingNodeOrder()).toBeNull();
  });

  it('reports terminal failure when recovery staging is unavailable', () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });

    expect(saveWorkspaceRelearnNode({ nodeId: 'item-1' })).toBe(false);
    expect(showAppRuntimeNotice).toHaveBeenCalledWith('Could not save this change. Try again.');
  });
});
