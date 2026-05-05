import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS } from '../model/editorMouseGestureSettings';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetContent = vi.fn();
const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);

const mockCtor = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(host: HTMLElement, options: { initialContent: string; onChange?: (content: string) => void }) {
      mockCtor(host, options);
    }
    destroy() {
      mockDestroy();
    }
    focus() {}
    getContent() {
      return mockGetContent();
    }
    getDocumentPositionAtViewportY() {
      return 0;
    }
    setContent(content: string) {
      mockSetContent(content);
    }
    getSelection() {
      return { from: 0, to: 0 };
    }
    setSelection(selection: { from: number; to: number }) {
      mockSetSelection(selection);
    }
    revealSelection() {}
    getScrollTop() {
      return 0;
    }
    setScrollTop(scrollTop: number) {
      mockSetScrollTop(scrollTop);
    }
    getScrollMetrics() {
      return mockGetScrollMetrics();
    }
    replaceSelection() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return mockOnScroll();
    }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function mockSurfaceRect(surface: HTMLElement) {
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
}

function drawGesture(surface: HTMLElement, events: MouseEvent[]) {
  act(() => {
    for (const event of events) {
      if (event.type === 'mousedown') {
        surface.dispatchEvent(event);
        continue;
      }
      window.dispatchEvent(event);
    }
  });
}

function dispatchSurfaceEvent(surface: HTMLElement, event: MouseEvent) {
  act(() => {
    surface.dispatchEvent(event);
  });
}

function resetMocks() {
  beforeEach(() => {
    mockCtor.mockClear();
    mockDestroy.mockClear();
    mockGetContent.mockClear();
    mockSetContent.mockClear();
    mockSetSelection.mockClear();
    mockSetScrollTop.mockClear();
    mockOnScroll.mockClear();
  });
}

describe('MarkdownEditor rendering', () => {
  resetMocks();

  it('does not recreate editor adapter when value changes', () => {
    const onChange = vi.fn();
    const view = render(<MarkdownEditor nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.rerender(<MarkdownEditor nodeId="node-1" onChange={onChange} value="ab" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('applies custom bottom padding when requested', () => {
    const { container } = render(
      <MarkdownEditor contentPaddingBottom="min(68dvh, 36rem)" nodeId="node-1" onChange={vi.fn()} value="a" />
    );

    expect(container.firstChild).toHaveStyle('--editor-content-padding-bottom: min(68dvh, 36rem)');
  });
});

function runLeftDownGestureTest() {
  mockGetScrollMetrics.mockReturnValue({ clientHeight: 300, scrollHeight: 1200, scrollTop: 420 });
  const onContextMenu = vi.fn();
  const { container } = render(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />);

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 200, clientY: 200 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 160, clientY: 200 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 160, clientY: 240 })
  ]);

  expect(container.querySelector('[data-editor-gesture-trail="true"]')).not.toBeNull();
  drawGesture(surface, [new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0, clientX: 160, clientY: 240 })]);
  dispatchSurfaceEvent(surface, new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 160, clientY: 240 }));

  expect(mockSetScrollTop).toHaveBeenCalledWith(900);
  expect(onContextMenu).not.toHaveBeenCalled();
  expect(container.querySelector('[data-editor-gesture-trail="true"]')).toBeNull();
}

function runLeftUpGestureTest() {
  mockGetScrollMetrics.mockReturnValue({ clientHeight: 250, scrollHeight: 1000, scrollTop: 0 });
  const { container } = render(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />);

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 220, clientY: 220 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 180, clientY: 220 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 180, clientY: 180 }),
    new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0, clientX: 180, clientY: 180 })
  ]);

  expect(mockSetScrollTop).toHaveBeenCalledWith(0);
}

function runContextMenuFallbackTest() {
  const onContextMenu = vi.fn();
  const { container } = render(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />);

  const surface = container.firstChild as HTMLElement;
  dispatchSurfaceEvent(surface, new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 120, clientY: 120 }));
  dispatchSurfaceEvent(surface, new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 120, clientY: 120 }));

  expect(mockSetScrollTop).not.toHaveBeenCalled();
  expect(onContextMenu).toHaveBeenCalledTimes(1);
}

function runOneStrokeGestureStyleTest() {
  const { container } = render(
    <MarkdownEditor
      mouseGestureBindings={[{ action: 'scroll-top', gesture: 'right' }]}
      mouseGestureSettings={{
        ...DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
        trailColor: '#ff5500',
        trailLineWidth: 5,
        trailOpacity: 0.6
      }}
      nodeId="node-1"
      onChange={vi.fn()}
      value="a"
    />
  );

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 180, clientY: 120 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 220, clientY: 120 })
  ]);

  const trail = container.querySelector('[data-editor-gesture-trail="true"]');
  expect(trail).toHaveAttribute('stroke', '#ff5500');
  expect(trail).toHaveAttribute('stroke-width', '5');
  expect(trail).toHaveAttribute('stroke-opacity', '0.6');

  drawGesture(surface, [new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0, clientX: 220, clientY: 120 })]);
  expect(mockSetScrollTop).toHaveBeenCalledWith(0);
}

describe('MarkdownEditor mouse gestures', () => {
  resetMocks();

  it('runs left-down gesture to scroll to bottom and suppresses context menu once', runLeftDownGestureTest);
  it('runs left-up gesture to scroll to top', runLeftUpGestureTest);
  it('keeps normal context menu behavior when no valid gesture is formed', runContextMenuFallbackTest);
  it('supports one-stroke gestures and uses custom trail styling', runOneStrokeGestureStyleTest);
});
