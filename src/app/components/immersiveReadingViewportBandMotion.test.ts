import { beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import {
  IMMERSIVE_READING_SCROLL_DURATION_MS,
  startImmersiveReadingScrollMotion
} from './immersiveReadingViewportBandMotion';

let callbacks: FrameRequestCallback[];

beforeEach(() => {
  callbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});

function createEditor() {
  let scrollTop = 100;
  const editor = {
    getScrollTop: vi.fn(() => scrollTop),
    setScrollTop: vi.fn((value: number) => {
      scrollTop = value;
    })
  } as unknown as EditorAdapter;
  return { editor, readScrollTop: () => scrollTop };
}

it('uses the reading-band cosine movement over the complete duration', () => {
  const { editor, readScrollTop } = createEditor();
  startImmersiveReadingScrollMotion(editor, 500);

  callbacks.shift()?.(0);
  callbacks.shift()?.(100);
  const earlyScrollTop = readScrollTop();
  callbacks.shift()?.(IMMERSIVE_READING_SCROLL_DURATION_MS / 2);
  const intermediateScrollTop = readScrollTop();
  callbacks.shift()?.(IMMERSIVE_READING_SCROLL_DURATION_MS);

  const earlyProgress = 100 / IMMERSIVE_READING_SCROLL_DURATION_MS;
  const expectedEarlyScrollTop = 100 + 400 * 0.5 * (1 - Math.cos(Math.PI * earlyProgress));
  expect(earlyScrollTop).toBeCloseTo(expectedEarlyScrollTop);
  expect(intermediateScrollTop).toBeCloseTo(300);
  expect(readScrollTop()).toBe(500);
});

it('stops moving when the viewport changes outside the animation', () => {
  const { editor } = createEditor();
  startImmersiveReadingScrollMotion(editor, 500);
  callbacks.shift()?.(0);
  vi.mocked(editor.getScrollTop).mockReturnValue(240);

  callbacks.shift()?.(100);

  expect(editor.setScrollTop).toHaveBeenCalledTimes(1);
});
