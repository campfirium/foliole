import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { resolveExistingHighlightAtPoint, resolveSelectionToolbarState } from './companionSelectionToolbarState';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import { createSnapshot } from './useCompanionWorkspaceSync.testSupport';

const payload: SelectionCommandPayload = {
  anchorId: 'anchor-1',
  clozeContent: 'Alpha [...] Gamma',
  entries: [{
    anchorId: 'anchor-1',
    clozeContent: 'Alpha [...] Gamma',
    locator: { from: 6, originalText: 'Beta', to: 10 },
    range: { from: 6, to: 10 },
    selectionText: 'Beta'
  }],
  parentNodeId: 'node-1',
  selectionText: 'Beta'
};

const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalMaxTouchPoints) {
    Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  } else {
    Reflect.deleteProperty(navigator, 'maxTouchPoints');
  }
  vi.restoreAllMocks();
});

function resolvePosition(maxTouchPoints: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  vi.spyOn(window, 'getSelection').mockReturnValue({
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        bottom: 120, height: 20, left: 100, right: 180, top: 100, width: 80
      })
    }),
    rangeCount: 1
  } as unknown as Selection);
  return resolveSelectionToolbarState({ content: '', fallback: { clientX: 140, clientY: 110 }, payload, snapshot: null });
}

it('places the annotation toolbar below a touch selection to avoid the native edit menu', () => {
  expect(resolvePosition(5)).toMatchObject({ noteTop: 232, top: 184 });
});

it('places the touch toolbar above a low selection without clipping the controls', () => {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  vi.spyOn(window, 'getSelection').mockReturnValue({
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        bottom: 750, height: 20, left: 100, right: 180, top: 730, width: 80
      })
    }),
    rangeCount: 1
  } as unknown as Selection);

  expect(resolveSelectionToolbarState({
    content: '', fallback: { clientX: 140, clientY: 740 }, payload, snapshot: null
  })).toMatchObject({ noteTop: 670, top: 622 });
});

it('retains the compact above-selection placement for pointer devices', () => {
  expect(resolvePosition(0)).toMatchObject({ noteTop: 128, top: 52 });
});

it.each(['highlight', 'cloze'] as const)('recognizes a rendered %s when the parent snapshot omits its stored body', (kind) => {
  const snapshot = createSnapshot();
  const parent = snapshot.nodesById['topic-1']!;
  parent.content = '';
  snapshot.nodesById.annotation = {
    ...parent, id: 'annotation', parentNodeId: parent.id,
    kind: kind === 'cloze' ? 'item' : 'topic', content: 'Beta',
    anchorLink: { id: 'anchor-beta', kind, locator: { from: 6, to: 10, originalText: 'Beta' } }
  };
  const target = resolveExistingHighlightAtPoint({
    editorRef: { current: {
      getContent: () => 'Alpha Beta Gamma',
      getDocumentPositionAtClientPoint: () => 8,
      getSelection: () => ({ from: 6, to: 10 })
    } as never },
    nodeId: parent.id, point: { clientX: 100, clientY: 120 }, snapshot
  });
  expect(target).toMatchObject({ nodeId: 'annotation', originalText: 'Beta', ...(kind === 'cloze' ? { kind } : {}) });
  expect(parent.content).toBe('');
});

it('keeps cloze correction available when native long press cancels the pointer after selection changes', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const snapshot = createSnapshot();
  const parent = snapshot.nodesById['topic-1']!;
  parent.content = '';
  snapshot.nodesById.annotation = { ...parent, id: 'annotation', parentNodeId: parent.id,
    kind: 'item', content: 'Alpha [...] Gamma',
    anchorLink: { id: 'anchor-beta', kind: 'cloze', locator: { from: 6, to: 10, originalText: 'Beta' } } };
  const target = document.createElement('span');
  target.className = 'cm-md-cloze';
  document.body.append(target);
  const { result } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: parent.id, snapshot
  }));
  act(() => {
    result.current.handleEditorReady({ getContent: () => 'Alpha Beta Gamma',
      getDocumentPositionAtClientPoint: () => 8,
      getSelection: () => ({ from: 6, to: 10 }), getSelectionRanges: () => [{ from: 6, to: 10 }] } as never);
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 120 }));
    document.dispatchEvent(new Event('selectionchange'));
    target.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    vi.advanceTimersByTime(240);
  });
  expect(result.current.selectionToolbar?.existingHighlight).toEqual({ kind: 'cloze', nodeId: 'annotation', originalText: 'Beta' });
  target.remove();
});

it.each([{ from: 6, to: 10, originalText: 'Beta' }, { from: 4, to: 12, originalText: 'a Beta G' }])(
  'does not choose a cloze when another annotation overlaps its selected text: %j', (overlap) => {
    const snapshot = createSnapshot();
    const parent = snapshot.nodesById['topic-1']!;
    parent.content = '';
    snapshot.nodesById.cloze = { ...parent, id: 'cloze', parentNodeId: parent.id,
      kind: 'item', anchorLink: { id: 'cloze', kind: 'cloze', locator: { from: 6, to: 10, originalText: 'Beta' } } };
    snapshot.nodesById.highlight = { ...parent, id: 'highlight', parentNodeId: parent.id,
      anchorLink: { id: 'highlight', kind: 'highlight', locator: overlap } };
    expect(resolveSelectionToolbarState({ content: 'Alpha Beta Gamma', fallback: { clientX: 100, clientY: 120 },
      payload: { ...payload, parentNodeId: parent.id }, snapshot }).existingHighlight).toBeUndefined();
  }
);
