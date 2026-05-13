import { vi } from 'vitest';

export interface TestRectInput {
  height: number;
  left: number;
  top: number;
  width: number;
}

export function createTestDomRect({ height, left, top, width }: TestRectInput): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

export function createTestDomRectList(rects: DOMRect[]): DOMRectList {
  const list = rects.slice() as DOMRect[] & { item(index: number): DOMRect | null };
  list.item = (index: number) => list[index] ?? null;
  return list as DOMRectList;
}

export function createTestSelection(overrides: Partial<Selection> = {}): Selection {
  return {
    addRange: vi.fn(),
    anchorNode: null,
    anchorOffset: 0,
    collapse: vi.fn(),
    collapseToEnd: vi.fn(),
    collapseToStart: vi.fn(),
    containsNode: vi.fn(() => false),
    deleteFromDocument: vi.fn(),
    direction: 'none',
    empty: vi.fn(),
    extend: vi.fn(),
    focusNode: null,
    focusOffset: 0,
    getRangeAt: vi.fn(),
    isCollapsed: true,
    modify: vi.fn(),
    rangeCount: 0,
    removeAllRanges: vi.fn(),
    removeRange: vi.fn(),
    selectAllChildren: vi.fn(),
    setBaseAndExtent: vi.fn(),
    setPosition: vi.fn(),
    toString: vi.fn(() => ''),
    type: 'None',
    ...overrides
  } as Selection;
}
