import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createPaletteReviewActions } from './appControllerPaletteReviewActions';
import { useAppControllerReviewEditing } from './appControllerReviewEditing';
import { resetReadingReviewFeedback } from './readingReviewFeedbackState';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';

vi.mock('./useReviewKeyboardShortcuts', () => ({ useReviewKeyboardShortcuts: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); resetReadingReviewFeedback(); });

function fixture() {
  const metrics = { clientHeight: 500, contentPaddingBottom: 700, scrollHeight: 2600, scrollTop: 700 };
  const save = vi.fn<(now?: string, options?: { releaseSequentialReading?: boolean }) => Promise<boolean>>(async () => true);
  const ws = {
    activeNodeId: 'a', nodeOrder: ['root', 'a', 'b'], trashedNodeIds: [],
    nodesById: { root: { id: 'root', kind: 'folder', sequentialReadingEnabled: true },
      a: { id: 'a', kind: 'topic', parentNodeId: 'root', content: 'Chapter A' } },
    reviewSession: { currentNodeId: 'a', isAnswerRevealed: false }, readReviewTopic: save
  };
  const runtime = { editorRef: { current: { getScrollMetrics: () => metrics } }, isViewingTrashNode: false };
  const controller = { runtime, nav: {}, externalView: { isExternalViewOpen: false },
    virtualView: { isVirtualViewOpen: false }, trash: { isTrashViewOpen: false } };
  return { metrics, save, ws, controller };
}

function createRead(entry: 'keyboard' | 'palette', data: ReturnType<typeof fixture>, study = true, gradable = false) {
  if (entry === 'palette') return createPaletteReviewActions({
    ...data.controller, ws: data.ws, isStudyMode: study, requestDeleteSourceTopic: () => false
  } as unknown as Parameters<typeof createPaletteReviewActions>[0]).readReviewTopic;
  renderHook(() => useAppControllerReviewEditing({
    controller: data.controller, ws: data.ws, isStudyMode: study, isCurrentReviewItemGradable: gradable,
    nowIso: '2026-09-23T00:00:00Z', hotkeys: { shortcutMap: {} }, resumeReviewItem: () => undefined,
    reviewSourceTopicDeleteDialog: { isOpen: false, requestDeleteSourceTopic: () => false }
  } as unknown as Parameters<typeof useAppControllerReviewEditing>[0]));
  return vi.mocked(useReviewKeyboardShortcuts).mock.calls.at(-1)![0].readReviewTopic;
}

for (const entry of ['keyboard', 'palette'] as const) {
  it(`${entry} reads live content-end metrics when invoked`, async () => {
    const data = fixture();
    const read = createRead(entry, data);
    await act(async () => { await read(); });
    expect(data.save.mock.calls[0]?.[1]?.releaseSequentialReading ?? false).toBe(false);
    data.metrics.scrollTop = 1400;
    await act(async () => { await read(); });
    expect(data.save.mock.calls[1]?.[1]?.releaseSequentialReading ?? false).toBe(true);
  });
  for (const exclusion of ['not-study', 'hidden-current', 'external', 'virtual', 'trash', 'trash-view', 'not-sequential', 'gradable', 'no-editor']) {
    it(`${entry} does not release when ${exclusion}`, async () => {
      const data = fixture();
      data.metrics.scrollTop = 1400;
      if (exclusion === 'hidden-current') data.ws.activeNodeId = 'b';
      if (exclusion === 'external') data.controller.externalView.isExternalViewOpen = true;
      if (exclusion === 'virtual') data.controller.virtualView.isVirtualViewOpen = true;
      if (exclusion === 'trash-view') data.controller.trash.isTrashViewOpen = true;
      if (exclusion === 'trash') data.controller.runtime.isViewingTrashNode = true;
      if (exclusion === 'not-sequential') data.ws.nodesById.root.sequentialReadingEnabled = false;
      if (exclusion === 'gradable') Object.assign(data.ws.nodesById.a, { kind: 'item', reveal: 'Answer' });
      if (exclusion === 'no-editor') Object.assign(data.controller.runtime.editorRef, { current: null });
      const read = createRead(entry, data, exclusion !== 'not-study', exclusion === 'gradable');
      await act(async () => { await read(); });
      expect(data.save).toHaveBeenCalledTimes(1);
      expect(data.save.mock.calls[0]?.[1]?.releaseSequentialReading ?? false).toBe(false);
    });
  }
}
