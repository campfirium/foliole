import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyImmersiveEntrySelection } from './immersiveReadingApplying';

function createReadyViewportEditor() {
  return {
    getContent: vi.fn(() => `${'A'.repeat(62000)}\n\n${'B'.repeat(40)}`),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 400, scrollHeight: 4000, scrollTop: 0 })),
    getSelection: vi.fn(() => ({ from: 61200, to: 61200 })),
    getViewportRect: vi.fn(() => ({ height: 400 })),
    isPositionNearViewportRatio: vi.fn(() => true),
    revealSelectionAtViewportRatio: vi.fn(),
    setParagraphMarker: vi.fn(),
    setSelection: vi.fn()
  };
}

function runNearAnchorScenario() {
  const setReadingSelection = vi.fn();
  const completeApplyingReadingPosition = vi.fn();
  const editor = createReadyViewportEditor();

  applyImmersiveEntrySelection({
    clearPendingSelection: vi.fn(),
    props: {
      completeApplyingReadingPosition,
      editorAdapterRef: { current: editor },
      getReadingPositionSyncState: () => ({
        reason: 'enter-immersive',
        startedAt: Date.now(),
        targetSelection: { from: 61200, to: 61200 }
      }),
      getReadingPositionSelection: () => ({ from: 61200, to: 61200 }),
      isImmersiveMode: true,
      setReadingPositionSelection: vi.fn()
    } as never,
    remainingAttempts: 1,
    scheduleRetry: vi.fn(),
    selection: { from: 61200, to: 61200 },
    setReadingSelection,
    shouldSkipNextScrollSyncRef: { current: false }
  });

  return { completeApplyingReadingPosition, editor, setReadingSelection };
}

describe('applyImmersiveEntrySelection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    });
  });

  it('completes once the target position is visually near the anchor without falling back to viewport sampling', () => {
    const { completeApplyingReadingPosition, editor, setReadingSelection } = runNearAnchorScenario();

    vi.runAllTimers();

    expect(editor.revealSelectionAtViewportRatio).toHaveBeenCalledWith({ from: 61200, to: 61200 }, 0.15);
    expect(editor.isPositionNearViewportRatio).toHaveBeenCalledWith(61200, 0.15, 0.05);
    expect(completeApplyingReadingPosition).toHaveBeenCalledWith('viewport-synced');
    expect(setReadingSelection).toHaveBeenCalledWith({ from: 61200, to: 61200 }, 'immersive-entry-apply');
  });

  it('keeps the target selection when immersive entry times out instead of overwriting with the top viewport sample', () => {
    const { completeApplyingReadingPosition, setReadingSelection } = runTimeoutFallbackScenario();

    vi.runAllTimers();

    expect(completeApplyingReadingPosition).toHaveBeenCalledWith('viewport-sync-timeout');
    expect(setReadingSelection).toHaveBeenLastCalledWith({ from: 4296, to: 4296 }, 'applying-target');
  });

  it('waits until the editor viewport is ready before applying the immersive entry selection', () => {
    const setReadingSelection = vi.fn();
    const scheduleRetry = vi.fn();
    const editor = {
      getScrollMetrics: vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 })),
      getViewportRect: vi.fn(() => ({ height: 0 })),
      revealSelectionAtViewportRatio: vi.fn(),
      setParagraphMarker: vi.fn(),
      setSelection: vi.fn()
    };

    applyImmersiveEntrySelection({
      clearPendingSelection: vi.fn(),
      props: {
        completeApplyingReadingPosition: vi.fn(),
        editorAdapterRef: { current: editor },
        getReadingPositionSyncState: () => ({ reason: 'enter-immersive', startedAt: Date.now(), targetSelection: { from: 601, to: 601 } }),
        getReadingPositionSelection: () => ({ from: 601, to: 601 }),
        isImmersiveMode: true,
        setReadingPositionSelection: vi.fn()
      } as never,
      remainingAttempts: 3,
      scheduleRetry,
      selection: { from: 601, to: 601 },
      setReadingSelection,
      shouldSkipNextScrollSyncRef: { current: false }
    });

    expect(scheduleRetry).toHaveBeenCalledTimes(1);
    expect(setReadingSelection).not.toHaveBeenCalled();
    expect(editor.setSelection).not.toHaveBeenCalled();
  });
});

function runTimeoutFallbackScenario() {
  const setReadingSelection = vi.fn();
  const completeApplyingReadingPosition = vi.fn();
  const editor = {
    getContent: vi.fn(() => 'Metadata\n\nAlpha'),
    getDocumentPositionAtViewportY: vi.fn(() => 14),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 400, scrollHeight: 4000, scrollTop: 0 })),
    getSelection: vi.fn(() => ({ from: 4296, to: 4296 })),
    getViewportRect: vi.fn(() => ({ bottom: 260, height: 200, left: 0, right: 400, top: 60, width: 400, x: 0, y: 60 })),
    isPositionNearViewportRatio: vi.fn(() => false),
    revealSelectionAtViewportRatio: vi.fn(),
    setParagraphMarker: vi.fn(),
    setSelection: vi.fn()
  };

  applyImmersiveEntrySelection({
    clearPendingSelection: vi.fn(),
    props: {
      activeNodeId: 'node-1',
      completeApplyingReadingPosition,
      editorAdapterRef: { current: editor },
      getReadingPositionSyncState: () => ({
        reason: 'enter-immersive',
        startedAt: Date.now(),
        targetSelection: { from: 4296, to: 4296 }
      }),
      getReadingPositionSelection: () => ({ from: 4296, to: 4296 }),
      isImmersiveMode: true,
      setReadingPositionSelection: vi.fn()
    } as never,
    remainingAttempts: 1,
    scheduleRetry: vi.fn(),
    selection: { from: 4296, to: 4296 },
    setReadingSelection,
    shouldSkipNextScrollSyncRef: { current: false }
  });

  return {
    completeApplyingReadingPosition,
    setReadingSelection
  };
}
