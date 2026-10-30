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

it('maps the left edge inward swipe to undo and the right edge inward swipe to redo', () => {
  const { apply } = setup();
  const undo = screen.getByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  pointer(undo, 'pointerdown', 2); pointer(undo, 'pointerup', 82);
  pointer(redo, 'pointerdown', 390); pointer(redo, 'pointerup', 310);
  expect(apply.mock.calls).toEqual([['undo'], ['redo']]);
});

it.each(['tap', 'short', 'outward', 'vertical', 'cancel', 'secondary', 'mouse'] as const)(
  'does not turn %s input into a history command', kind => {
    const { apply } = setup();
    const undo = screen.getByRole('button', { name: 'Undo' });
    pointer(undo, 'pointerdown', 2, 400, kind === 'secondary' ? { isPrimary: false }
      : kind === 'mouse' ? { pointerType: 'mouse' } : {});
    if (kind === 'vertical') pointer(undo, 'pointermove', 12, 470);
    if (kind === 'cancel') pointer(undo, 'pointercancel', 12);
    const x = kind === 'tap' ? 2 : kind === 'short' ? 22 : kind === 'outward' ? -78 : 82;
    pointer(undo, 'pointerup', x);
    expect(apply).not.toHaveBeenCalled();
  });

it('leaves an existing text selection untouched', () => {
  const { apply } = setup();
  const text = document.createTextNode('Selected text'); document.body.append(text);
  const range = document.createRange(); range.selectNodeContents(text);
  window.getSelection()!.addRange(range);
  const undo = screen.getByRole('button', { name: 'Undo' });
  pointer(undo, 'pointerdown', 2); pointer(undo, 'pointerup', 82);
  expect(apply).not.toHaveBeenCalled();
  expect(window.getSelection()?.toString()).toBe('Selected text');
  text.remove();
});

it('does not execute an unavailable history direction', () => {
  const { apply } = setup(true, false, true);
  const undo = screen.getByRole('button', { name: 'Undo' });
  pointer(undo, 'pointerdown', 2); pointer(undo, 'pointerup', 82);
  expect(apply).not.toHaveBeenCalled();
});

it('reserves only the active central band and releases it on exit', () => {
  const ui = setup();
  expect(setCompanionFlowGestureRegion).toHaveBeenCalledWith({ enabled: true, edgeWidth: 48, bandHeight: 160, viewportWidth: window.innerWidth });
  ui.unmount();
  expect(setCompanionFlowGestureRegion).toHaveBeenLastCalledWith({ enabled: false, edgeWidth: 48, bandHeight: 160, viewportWidth: window.innerWidth });
});

it('applies each busy transition once and still releases the region when leaving Flow', () => {
  const apply = vi.fn();
  const surface = (enabled: boolean) => <LocalizationProvider initialLanguagePreference="en">
    <CompanionFlowEdgeGestures enabled={enabled} canUndo canRedo onApply={apply} />
  </LocalizationProvider>;
  const ui = render(surface(true));
  vi.mocked(setCompanionFlowGestureRegion).mockClear();
  ui.rerender(surface(false));
  expect(vi.mocked(setCompanionFlowGestureRegion).mock.calls.map(([region]) => region.enabled)).toEqual([false]);
  ui.rerender(surface(true));
  expect(vi.mocked(setCompanionFlowGestureRegion).mock.calls.map(([region]) => region.enabled)).toEqual([false, true]);
  fireEvent(window, new Event('resize'));
  expect(vi.mocked(setCompanionFlowGestureRegion).mock.calls.map(([region]) => region.enabled)).toEqual([false, true, true]);
  ui.unmount();
  expect(setCompanionFlowGestureRegion).toHaveBeenLastCalledWith({ enabled: false, edgeWidth: 48,
    bandHeight: 160, viewportWidth: window.innerWidth });
  vi.mocked(setCompanionFlowGestureRegion).mockClear();
  fireEvent(window, new Event('resize'));
  expect(setCompanionFlowGestureRegion).not.toHaveBeenCalled();
});

it('reports a native reservation failure instead of pretending the gesture is available', async () => {
  vi.mocked(setCompanionFlowGestureRegion).mockRejectedValueOnce(new Error('unavailable'));
  const { apply } = setup();
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Edge gestures are unavailable'));
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(apply).not.toHaveBeenCalled();
});
