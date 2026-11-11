import { describe, expect, it, vi } from 'vitest';

import { resolvePrimaryVisiblePosition } from './codeMirrorVisiblePosition';

describe('resolvePrimaryVisiblePosition', () => {
  it('uses the selected visible line coordinates instead of the generic content column', () => {
    const line = document.createElement('div');
    line.className = 'cm-line';
    line.textContent = '| row | value |';
    Object.defineProperty(line, 'getBoundingClientRect', {
      value: () => ({ bottom: 196, height: 24, left: 220, right: 620, top: 172, width: 400 })
    });

    const posAtCoords = vi.fn(({ x, y }: { x: number; y: number }) =>
      x >= 220 && x < 620 && y >= 172 && y < 196 ? 64955 : null
    );
    const view = {
      contentDOM: {
        getBoundingClientRect: () => ({ left: 40, right: 760, width: 720 }),
        querySelectorAll: () => [line]
      },
      documentTop: 150,
      lineBlockAtHeight: vi.fn(() => ({ from: 3157 })),
      posAtCoords,
      scrollDOM: {
        getBoundingClientRect: () => ({ bottom: 420, height: 300, top: 120 })
      }
    } as never;

    expect(resolvePrimaryVisiblePosition(view)).toBe(64955);
  });
});
