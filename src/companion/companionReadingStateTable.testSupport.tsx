// Harness for the reading state table: drives the real reading surface and reports what a reader would observe.
import { act, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { host } from './companionReadingStateTable.host.testSupport';

export type Platform = 'android' | 'ios';

export interface Observation {
  /** Distinct body boundaries seen at the checkpoints, as `top/bottom`; two entries mean the body moved. */
  body: string[];
  /** System bar requests the Android host received during the row. */
  bars: ('hidden' | 'shown')[];
  tools: 'visible' | 'hidden' | 'editing' | 'absent';
  selection: 'none' | 'native' | 'managed';
  /** What each tap or swipe did, in order. */
  tap: string[][];
}

const surfaceElement = () => document.querySelector<HTMLElement>('[data-companion-reading-surface="true"]');
const selectionState = (): Observation['selection'] =>
  host.managed ? 'managed' : window.getSelection()?.isCollapsed === false ? 'native' : 'none';
const menuOpen = () => document.querySelector('[data-companion-selection-toolbar]') !== null;

function toolsState(): Observation['tools'] {
  if (!surfaceElement()) return 'absent';
  if (screen.queryByTestId('companion-reading-edit-done')) return 'editing';
  return screen.queryByTestId('companion-reading-exit') ? 'visible' : 'hidden';
}

function pixels(value: string) {
  const expression = value.replace(/env\([^)]*\)/g, '0px').replace(/var\([^)]*\)/g, '0px')
    .replace(/([\d.]+)rem/g, (_, n: string) => `${Number(n) * 16}`).replace(/([\d.]+)px/g, '$1')
    .replace(/calc/g, '').replace(/max/g, 'Math.max');
  if (!/^[\d\s.+\-*/(),Mathmax]*$/.test(expression)) throw new Error(`Unresolvable boundary: ${value}`);
  return Number(new Function(`return ${expression || 0};`)());
}

// jsdom applies no stylesheet. On a bounded (Android) surface the viewport rule in companionReadingDisplay.css
// places the body from the measured variables and overrides the overlay padding; elsewhere the class decides.
function bodyBoundary() {
  const surface = surfaceElement();
  if (!surface) return null;
  if (surface.dataset.readingSelectionViewport) {
    const top = pixels(surface.style.getPropertyValue('--companion-reading-chrome-bottom'));
    const bottom = pixels(surface.style.getPropertyValue('--companion-reading-viewport-bottom'));
    return `${top > 0 ? 'reserved' : 'edge'}/${bottom > 0 ? 'reserved' : 'edge'}`;
  }
  return surface.classList.contains('companion-reading-overlay') ? 'edge/edge' : 'reserved/reserved';
}

function rect(top: number, height: number): DOMRect {
  return { x: 0, y: top, top, left: 0, right: 375, width: 375, bottom: top + height, height, toJSON: () => ({}) };
}

export function installLayout() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('companion-reading-top-chrome')) return rect(0, 48);
    if (this.classList.contains('companion-reading-bottom-chrome')) return rect(window.innerHeight - 64, 64);
    if (this.classList.contains('companion-review-footer')) return rect(window.innerHeight - 80, 80);
    if (this.matches('[data-companion-reading-surface]')) return rect(0, 812);
    return original.call(this);
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true,
    get(this: HTMLElement) { return this.matches('[data-companion-reading-surface]') ? 812 : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true,
    get(this: HTMLElement) { return this.matches('[data-companion-reading-surface]') ? 4000 : 0; } });
}

export function removeLayout() {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
}

// Real pointer events are cancelable; a document listener uses that to claim a tap.
function pointer(target: HTMLElement, type: string, x: number, y = 300) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
  fireEvent(target, event);
}

function touchTap(target: HTMLElement, x: number) {
  pointer(target, 'pointerdown', x);
  pointer(target, 'pointerup', x);
  fireEvent.click(target, { detail: 1, clientX: x, clientY: 300 });
}

export function createProbe() {
  const body: string[] = [];
  const taps: string[][] = [];
  const checkpoint = () => {
    const value = bodyBoundary();
    if (value && !body.includes(value)) body.push(value);
  };
  const flush = async (ms = 0) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    checkpoint();
  };
  const gesture = async (perform: () => void) => {
    const before = { selection: selectionState(), menu: menuOpen(), tools: toolsState(), page: surfaceElement()?.scrollTop };
    act(perform);
    await flush(20);
    const effects: string[] = [];
    if (before.selection !== 'none' && selectionState() === 'none') effects.push('clear-selection');
    else if (before.selection === 'none' && before.menu && !menuOpen()) effects.push('close-menu');
    if (before.tools !== toolsState()) effects.push('toggle-tools');
    if (before.page !== surfaceElement()?.scrollTop) effects.push('turn-page');
    taps.push(effects);
  };
  return {
    checkpoint,
    flush,
    tap: (target: HTMLElement, x = 185) => gesture(() => touchTap(target, x)),
    swipeUp: (target: HTMLElement) => gesture(() => {
      pointer(target, 'pointerdown', 185, 500);
      pointer(target, 'pointermove', 185, 350);
      pointer(target, 'pointerup', 185, 300);
    }),
    async click(element: HTMLElement) {
      fireEvent.click(element);
      await flush();
    },
    /** Forget what happened while arranging the scene. */
    startObserving() {
      host.apply.mockClear();
      body.length = 0;
      taps.length = 0;
      checkpoint();
    },
    observe(): Observation {
      return {
        body: [...body].sort(),
        bars: host.apply.mock.calls.map(([target]) => (target as { hidden: boolean }).hidden ? 'hidden' as const : 'shown' as const),
        tools: toolsState(),
        selection: selectionState(),
        tap: [...taps]
      };
    }
  };
}

export type Probe = ReturnType<typeof createProbe>;

export const bodyText = () => screen.getByText('Reading body');

export function selectBodyText() {
  const text = bodyText().firstChild!;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 'Reading'.length);
  // jsdom has no text layout: the selection covers no screen point, so any tap lands outside it.
  Object.defineProperty(range, 'getClientRects', { value: () => [] });
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => rect(100, 20) });
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
}

/** Android hands a finished long press to the Foliole-managed reading range. */
export async function selectManagedText(probe: Probe) {
  fireEvent.touchStart(bodyText(), { touches: [{ clientX: 40, clientY: 100 }] });
  selectBodyText();
  act(() => { document.dispatchEvent(new Event('foliole-android-reading-touch-release')); });
  await probe.flush(300);
}
