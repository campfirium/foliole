import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

import { EDIT_TOGGLE_ANCHOR_RATIO, useCompanionEditToggleScrollAnchor } from './useCompanionEditToggleScrollAnchor';

const SURFACE_TOP = 40;
const SURFACE_HEIGHT = 800;
const LINE_HEIGHT = 20;

/** A surface whose content lays out one line per 20px of document position. */
function createSurface(scrollTop: number) {
  const surface = document.createElement('section');
  surface.scrollTop = scrollTop;
  let currentScrollTop = scrollTop;
  Object.defineProperty(surface, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => { currentScrollTop = Math.max(0, value); }
  });
  surface.getBoundingClientRect = () => ({ top: SURFACE_TOP, height: SURFACE_HEIGHT } as DOMRect);
  return surface;
}

function createEditor(surface: HTMLElement, contentTop: number) {
  return {
    focus: vi.fn(),
    getDocumentPositionAtViewportY: (clientY: number) =>
      Math.floor((clientY - SURFACE_TOP + surface.scrollTop - contentTop) / LINE_HEIGHT),
    getPositionViewportTop: (position: number) => SURFACE_TOP + contentTop + position * LINE_HEIGHT - surface.scrollTop,
    setSelection: vi.fn()
  } as unknown as EditorAdapter & { focus: ReturnType<typeof vi.fn>; setSelection: ReturnType<typeof vi.fn> };
}

function flushFrames(count: number) {
  for (let index = 0; index < count; index += 1) vi.advanceTimersToNextFrame();
}

function useFakeFrames() {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); });
}

describe('useCompanionEditToggleScrollAnchor alignment', () => {
  useFakeFrames();

  it('keeps the anchored line at the same height after entering editing remounts the editor', () => {
    const surface = createSurface(2130);
    const { result } = renderHook(() => useCompanionEditToggleScrollAnchor({ current: surface }));
    const reading = createEditor(surface, 56);
    const anchoredPosition = reading.getDocumentPositionAtViewportY(SURFACE_TOP + SURFACE_HEIGHT * EDIT_TOGGLE_ANCHOR_RATIO)!;
    const anchoredTop = reading.getPositionViewportTop!(anchoredPosition)!;

    act(() => { result.current.capture(reading, true); });
    surface.scrollTop = 0;
    const editing = createEditor(surface, 120);
    act(() => {
      result.current.onEditorReady(editing);
      flushFrames(5);
    });

    expect(editing.getPositionViewportTop!(anchoredPosition)).toBe(anchoredTop);
    expect(editing.setSelection).toHaveBeenCalledWith({ from: anchoredPosition, to: anchoredPosition });
    expect(editing.focus).toHaveBeenCalled();
  });

  it('restores the reading position on exit without moving the caret or focusing', () => {
    const surface = createSurface(2251);
    const { result } = renderHook(() => useCompanionEditToggleScrollAnchor({ current: surface }));
    const editing = createEditor(surface, 120);
    const anchoredPosition = editing.getDocumentPositionAtViewportY(SURFACE_TOP + SURFACE_HEIGHT * EDIT_TOGGLE_ANCHOR_RATIO)!;
    const anchoredTop = editing.getPositionViewportTop!(anchoredPosition)!;

    act(() => { result.current.capture(editing, false); });
    surface.scrollTop = 0;
    const reading = createEditor(surface, 56);
    act(() => {
      result.current.onEditorReady(reading);
      flushFrames(5);
    });

    expect(reading.getPositionViewportTop!(anchoredPosition)).toBe(anchoredTop);
    expect(reading.setSelection).not.toHaveBeenCalled();
    expect(reading.focus).not.toHaveBeenCalled();
  });

});

describe('useCompanionEditToggleScrollAnchor late keyboard', () => {
  useFakeFrames();

  function enterEditing(scrollTop: number) {
    const surface = createSurface(scrollTop);
    const { result } = renderHook(() => useCompanionEditToggleScrollAnchor({ current: surface }));
    act(() => { result.current.capture(createEditor(surface, 56), true); });
    surface.scrollTop = 0;
    const editing = createEditor(surface, 120);
    act(() => {
      result.current.onEditorReady(editing);
      flushFrames(5);
    });
    return surface;
  }

  /** The keyboard resizes the window and the platform scrolls the caret on its own. */
  function openKeyboard(surface: HTMLElement) {
    act(() => {
      vi.advanceTimersByTime(900);
      surface.scrollTop += 300;
      window.dispatchEvent(new Event('resize'));
      flushFrames(5);
    });
  }

  it('realigns when the keyboard arrives after the line had already settled', () => {
    const surface = enterEditing(2130);
    const settled = surface.scrollTop;

    openKeyboard(surface);

    expect(surface.scrollTop).toBe(settled);
  });

  it('keeps the start of the document clear of the editing toolbar', () => {
    const surface = enterEditing(0);
    expect(surface.scrollTop).toBe(0);

    openKeyboard(surface);

    expect(surface.scrollTop).toBe(0);
  });

  it('leaves the position alone once the reader types', () => {
    const surface = enterEditing(2130);
    const settled = surface.scrollTop;
    act(() => { document.dispatchEvent(new Event('beforeinput')); });

    openKeyboard(surface);

    expect(surface.scrollTop).toBe(settled + 300);
  });
});

describe('useCompanionEditToggleScrollAnchor release', () => {
  useFakeFrames();

  it('lets the reader take over before the remounted editor is aligned', () => {
    const surface = createSurface(1200);
    const { result } = renderHook(() => useCompanionEditToggleScrollAnchor({ current: surface }));
    act(() => { result.current.capture(createEditor(surface, 56), false); });
    surface.scrollTop = 0;

    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
      result.current.onEditorReady(createEditor(surface, 56));
      flushFrames(5);
    });

    expect(surface.scrollTop).toBe(0);
  });

  it('ignores an editor that becomes ready long after the toggle', () => {
    const surface = createSurface(1200);
    const { result } = renderHook(() => useCompanionEditToggleScrollAnchor({ current: surface }));
    act(() => { result.current.capture(createEditor(surface, 56), false); });
    surface.scrollTop = 0;

    act(() => {
      vi.advanceTimersByTime(5000);
      result.current.onEditorReady(createEditor(surface, 56));
      flushFrames(5);
    });

    expect(surface.scrollTop).toBe(0);
  });
});
