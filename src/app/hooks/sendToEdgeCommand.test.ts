import { expect, it, vi } from 'vitest';

import { sendTopicToEdge } from '../../shared/platform/runtime/edgeReading';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';

import { createSendToEdgeCommand } from './sendToEdgeCommand';

vi.mock('../../shared/platform/runtime', () => ({ isDesktopRuntime: () => true }));
vi.mock('../../shared/platform/runtime/edgeReading', () => ({ sendTopicToEdge: vi.fn().mockResolvedValue(true) }));
vi.mock('../../store/workspaceNodePreparation', () => ({ ensureWorkspaceNodeDocumentReady: vi.fn() }));

it.each([false, true])('sends the whole topic once after flushing (study mode: %s)', async (isStudyMode) => {
  let finishFlush: (value: boolean) => void = () => undefined;
  const pendingFlush = new Promise<boolean>((resolve) => { finishFlush = resolve; });
  const args = {
    runtime: { isViewingTrashNode: false, flushPendingEditorDraftImmediately: () => pendingFlush },
    ws: { activeNodeId: 'topic', nodesById: { topic: { kind: 'topic', title: 'Current topic' } }, trashedNodeIds: [] },
    externalView: { isExternalViewOpen: false },
    virtualView: { isVirtualViewOpen: false },
    isStudyMode,
    demoOperationTranslate: () => 'Contents'
  } as unknown as Parameters<typeof createSendToEdgeCommand>[0];
  vi.clearAllMocks();
  const markdown = 'First paragraph.\n\nLast edited paragraph.';
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockResolvedValue({
    content: markdown, hideTitleHeading: false, kind: 'topic', reveal: null
  });
  const sending = createSendToEdgeCommand(args)();
  expect(ensureWorkspaceNodeDocumentReady).not.toHaveBeenCalled();
  await expect(createSendToEdgeCommand(args)()).resolves.toBe(false);
  finishFlush(true);
  await expect(sending).resolves.toBe(true);
  expect(sendTopicToEdge).toHaveBeenCalledExactlyOnceWith({
    title: 'Current topic', markdown, contentsLabel: 'Contents'
  });
});
