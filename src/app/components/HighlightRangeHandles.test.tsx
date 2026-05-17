import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { HighlightRangeHandles } from './HighlightRangeHandles';

function mockRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => undefined,
    top,
    width,
    x: left,
    y: top
  } as DOMRect;
}

function createEditorAdapter(overrides: Partial<EditorAdapter> = {}): EditorAdapter {
  return {
    destroy: vi.fn(),
    focus: vi.fn(),
    getContent: vi.fn(() => 'Welcome to Foliole'),
    getDocumentPositionAtViewportY: vi.fn(() => 0),
    getLineBlockHeight: vi.fn(() => 24),
    getScrollMetrics: vi.fn(() => ({ clientHeight: 100, scrollHeight: 200, scrollTop: 0 })),
    getScrollTop: vi.fn(() => 0),
    getSelection: vi.fn(() => ({ from: 0, to: 0 })),
    getSelectionRanges: vi.fn(() => []),
    isPositionNearViewportRatio: vi.fn(() => true),
    onContentChange: vi.fn(() => () => undefined),
    onScroll: vi.fn(() => () => undefined),
    replaceRange: vi.fn(),
    replaceSelection: vi.fn(),
    restoreSelection: vi.fn(),
    revealPosition: vi.fn(),
    revealSelection: vi.fn(),
    setContent: vi.fn(),
    setDiffDecorations: vi.fn(),
    setSearchDecorations: vi.fn(),
    setScrollTop: vi.fn(),
    setSelection: vi.fn(),
    setSelectionRanges: vi.fn(),
    ...overrides
  };
}

it('renders visible range handles for an adjustable highlight', () => {
  const editor = createEditorAdapter({
    getPositionClientRect: vi.fn((position: number) =>
      position === 0 ? mockRect(40, 80, 8, 20) : mockRect(124, 80, 8, 20)
    )
  });

  render(
    <HighlightRangeHandles
      editor={editor}
      highlight={{ locator: { from: 0, to: 7 }, nodeId: 'highlight-1' }}
      onCommit={vi.fn()}
      parentContent="Welcome to Foliole"
    />
  );

  const handles = document.querySelectorAll('[data-highlight-range-handle="true"]');
  expect(handles).toHaveLength(2);
  expect(handles[0]).toHaveClass('h-6', 'w-4', 'cursor-ew-resize');
  expect(handles[0]?.querySelector('.bg-cloze-yellow')).not.toBeNull();
  expect(handles[0]?.querySelector('.bg-foreground\\/55')).not.toBeNull();
  expect(handles[1]).toHaveClass('h-6', 'w-4', 'cursor-ew-resize');
  expect(handles[1]?.querySelector('.bg-cloze-yellow')).not.toBeNull();
  expect(handles[1]?.querySelector('.bg-foreground\\/55')).not.toBeNull();
});

it('commits the dragged highlight range', () => {
  const onCommit = vi.fn(() => true);
  const editor = createEditorAdapter({
    getDocumentPositionAtClientPoint: vi.fn(() => 3),
    getPositionClientRect: vi.fn((position: number) =>
      position === 0 ? mockRect(40, 80, 8, 20) : mockRect(124, 80, 8, 20)
    )
  });

  render(
    <HighlightRangeHandles
      editor={editor}
      highlight={{ locator: { from: 0, to: 7 }, nodeId: 'highlight-1' }}
      onCommit={onCommit}
      parentContent="Welcome to Foliole"
    />
  );

  const startHandle = document.querySelector('[data-highlight-range-handle="true"]');
  expect(startHandle).not.toBeNull();

  act(() => {
    startHandle?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 90 }));
  });
  act(() => {
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  expect(editor.setSelection).not.toHaveBeenCalled();
  expect(onCommit).toHaveBeenCalledWith('highlight-1', 'Welcome to Foliole', { from: 3, to: 7 });
});

it('keeps the committed range when pointerup follows pointermove before React state flushes', () => {
  const onCommit = vi.fn(() => true);
  const editor = createEditorAdapter({
    getDocumentPositionAtClientPoint: vi.fn(() => 3),
    getPositionClientRect: vi.fn((position: number) =>
      position === 3 ? mockRect(70, 80, 8, 20) : mockRect(124, 80, 8, 20)
    )
  });

  render(
    <HighlightRangeHandles
      editor={editor}
      highlight={{ locator: { from: 0, to: 7 }, nodeId: 'highlight-1' }}
      onCommit={onCommit}
      parentContent="Welcome to Foliole"
    />
  );

  const startHandle = document.querySelector('[data-highlight-range-handle="true"]');
  act(() => {
    startHandle?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 90 }));
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  expect(onCommit).toHaveBeenCalledWith('highlight-1', 'Welcome to Foliole', { from: 3, to: 7 });
  expect(editor.getPositionClientRect).toHaveBeenLastCalledWith(7);
});
