import { afterEach, expect, it, vi } from 'vitest';

import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import { resolveSelectionToolbarState } from './companionSelectionToolbarState';

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
  return resolveSelectionToolbarState({ fallback: { clientX: 140, clientY: 110 }, payload, snapshot: null });
}

it('places the annotation toolbar below a touch selection to avoid the native edit menu', () => {
  expect(resolvePosition(5)).toMatchObject({ noteTop: 178, top: 130 });
});

it('retains the compact above-selection placement for pointer devices', () => {
  expect(resolvePosition(0)).toMatchObject({ noteTop: 128, top: 52 });
});
