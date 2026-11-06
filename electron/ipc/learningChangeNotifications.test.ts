// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

const mocks = vi.hoisted(() => ({ save: vi.fn(), commit: vi.fn(), notify: vi.fn() }));
vi.mock('../database/dailyFlow.js', () => ({ commitDesktopDailyFlow: mocks.commit }));
vi.mock('../database/nodeReadingState.js', () => ({ saveNodeReadingState: mocks.save }));
vi.mock('../database/nodeReviewState.js', () => ({ saveNodeReviewState: mocks.save }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: mocks.notify }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
import { handleDailyFlowCommand } from './dailyFlowCommands.js';
import { handleReadingAndReviewCommand } from './storageReadCommands.js';

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockReset(); });
it.each([
  [NATIVE_COMMANDS.saveNodeReadingState, 'readingNodeIds'],
  [NATIVE_COMMANDS.saveNodeReviewState, 'reviewNodeIds']
])('publishes the committed %s target through the existing learning scope', (command, field) => {
  const origin = {} as never;
  handleReadingAndReviewCommand(command, { nodeId: 'topic', reading: null, review: null, updatedAt: '2026-11-06T08:00:00Z' }, origin);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.notify).toHaveBeenCalledWith(null, expect.objectContaining({ refreshingWindow: origin, workspaceScope: {
    kind: 'nodes', nodeIds: [], [field]: ['topic']
  } }));
});
it('does not publish learning invalidation when the write fails', () => {
  mocks.save.mockImplementation(() => { throw new Error('write failed'); });
  expect(() => handleReadingAndReviewCommand(NATIVE_COMMANDS.saveNodeReadingState,
    { nodeId: 'topic', reading: null, updatedAt: '2026-11-06T08:00:00Z' })).toThrow('write failed');
  expect(mocks.notify).not.toHaveBeenCalled();
});

it('publishes daily Flow learning only after its commit succeeds', async () => {
  const input = { opId: 'read', now: '2026-11-06T08:00:00.000Z', token: { scope: 'a', dayKey: 'day', revision: 1 },
    readings: [{ nodeId: 'topic', before: null, after: null }] };
  mocks.commit.mockResolvedValue({});
  await handleDailyFlowCommand(NATIVE_COMMANDS.commitDailyFlow, input);
  expect(mocks.notify).toHaveBeenCalledWith(null, expect.objectContaining({ workspaceScope: {
    kind: 'nodes', nodeIds: [], readingNodeIds: ['topic'], reviewNodeIds: []
  } }));
  mocks.notify.mockClear();
  mocks.commit.mockRejectedValue(new Error('write failed'));
  await expect(handleDailyFlowCommand(NATIVE_COMMANDS.commitDailyFlow, input)).rejects.toThrow('write failed');
  expect(mocks.notify).not.toHaveBeenCalled();
});
