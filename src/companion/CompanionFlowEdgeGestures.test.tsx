import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { setCompanionFlowGestureRegion } from '../shared/platform/companion/runtime/companionFlowGestureRegion';

import { CompanionFlowEdgeGestures } from './CompanionFlowEdgeGestures';

vi.mock('../shared/platform/companion/runtime/companionFlowGestureRegion', () => ({ setCompanionFlowGestureRegion: vi.fn(async () => {}) }));
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: () => {} });
});
afterEach(() => { window.getSelection()?.removeAllRanges(); });

function setup(enabled = true, canUndo = true, canRedo = true) {
  const apply = vi.fn();
  const ui = render(<LocalizationProvider initialLanguagePreference="en"><CompanionFlowEdgeGestures enabled={enabled}
    canUndo={canUndo} canRedo={canRedo} onApply={apply} /></LocalizationProvider>);
  return { ...ui, apply };
}
function pointer(element: HTMLElement, type: string, x: number, y = 400,
  extra: { pointerId?: number; isPrimary?: boolean; pointerType?: string } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch', ...extra });
  fireEvent(element, event);
}

it('maps a leftward inward swipe to undo and a rightward inward swipe to redo', () => {
  const { apply } = setup();
  const undo = screen.getByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  pointer(undo, 'pointerdown', 390); pointer(undo, 'pointerup', 310);
  pointer(redo, 'pointerdown', 2); pointer(redo, 'pointerup', 82);
  expect(apply.mock.calls).toEqual([['undo'], ['redo']]);
});

it.each(['tap', 'short', 'outward', 'vertical', 'cancel', 'secondary', 'mouse'] as const)(
  'does not turn %s input into a history command', kind => {
    const { apply } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    pointer(undo, 'pointerdown', 390, 400, kind === 'secondary' ? { isPrimary: false }
      : kind === 'mouse' ? { pointerType: 'mouse' } : {});
    if (kind === 'vertical') pointer(undo, 'pointermove', 380, 470);
    if (kind === 'cancel') pointer(undo, 'pointercancel', 380);
    const x = kind === 'tap' ? 390 : kind === 'short' ? 370 : kind === 'outward' ? 470 : 310;
    pointer(undo, 'pointerup', x);
    expect(apply).not.toHaveBeenCalled();
  });

it('leaves an existing text selection untouched', () => {
  const { apply } = setup();
  const text = document.createTextNode('Selected text'); document.body.append(text);
  const range = document.createRange(); range.selectNodeContents(text);
  window.getSelection()!.addRange(range);
  const undo = screen.getByRole('button', { name: 'Undo' });
  pointer(undo, 'pointerdown', 390); pointer(undo, 'pointerup', 310);
  expect(apply).not.toHaveBeenCalled();
  expect(window.getSelection()?.toString()).toBe('Selected text');
  text.remove();
});

it('does not execute an unavailable history direction', () => {
  const { apply } = setup(true, false, true);
  const undo = screen.getByRole('button', { name: 'Undo' });
  pointer(undo, 'pointerdown', 390); pointer(undo, 'pointerup', 310);
  expect(apply).not.toHaveBeenCalled();
});

it('reserves only the active central band and releases it on exit', () => {
  const ui = setup();
  expect(setCompanionFlowGestureRegion).toHaveBeenCalledWith({ enabled: true, edgeWidth: 24, bandHeight: 160, viewportWidth: window.innerWidth });
  ui.unmount();
  expect(setCompanionFlowGestureRegion).toHaveBeenLastCalledWith({ enabled: false, edgeWidth: 24, bandHeight: 160, viewportWidth: window.innerWidth });
});

it('reports a native reservation failure instead of pretending the gesture is available', async () => {
  vi.mocked(setCompanionFlowGestureRegion).mockRejectedValueOnce(new Error('unavailable'));
  const { apply } = setup();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Edge gestures are unavailable'));
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});
