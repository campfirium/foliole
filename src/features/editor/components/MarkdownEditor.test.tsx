import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../image-cloze/model/imageClozePresentation';
import { SettingsMouseGesturesSection } from '../../settings/components/sections/SettingsMouseGesturesSection';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';
import {
  DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
  setEditorMouseGestureAction,
  setEditorMouseGestureTrailColor,
  setEditorMouseGestureTrailLineWidth,
  setEditorMouseGestureTrailOpacity
} from '../model/editorMouseGestureSettings';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetNodeId = vi.fn();
const mockRefreshImageClozePresentation = vi.fn();
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
    getLineBlockHeight() {
      return 24;
    }
    setContent(content: string) {
      mockSetContent(content);
    }
    setDiffDecorations(diffDecorations: unknown) {
      mockSetDiffDecorations(diffDecorations);
    }
    setHideTitleHeading(value: boolean) {
      mockSetHideTitleHeading(value);
    }
    setNodeId(nodeId: string | null) {
      mockSetNodeId(nodeId);
    }
    refreshImageClozePresentation() {
      mockRefreshImageClozePresentation();
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
    replaceRange() {}
    onContentChange() {
      return () => undefined;
    }
    onScroll() {
      return mockOnScroll();
    }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

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
    mockSetDiffDecorations.mockClear();
    mockSetHideTitleHeading.mockClear();
    mockSetNodeId.mockClear();
    mockRefreshImageClozePresentation.mockClear();
    mockSetSelection.mockClear();
    mockSetScrollTop.mockClear();
    mockOnScroll.mockClear();
  });
}

describe('MarkdownEditor rendering', () => {
  resetMocks();

  it('does not recreate editor adapter when value changes', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.rerender(<MarkdownEditor nodeId="node-1" onChange={onChange} value="ab" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockDestroy).not.toHaveBeenCalled();

    view.unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('applies custom bottom padding when requested', () => {
    const { container } = renderWithMouseGestureProvider(
      <MarkdownEditor contentPaddingBottom="min(68dvh, 36rem)" nodeId="node-1" onChange={vi.fn()} value="a" />
    );

    expect(container.firstChild).toHaveStyle('--editor-content-padding-bottom: min(68dvh, 36rem)');
  });

  it('updates title-heading visibility without recreating editor adapter', () => {
    const onChange = vi.fn();
    const view = renderWithMouseGestureProvider(<MarkdownEditor hideTitleHeading={false} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);

    view.rerender(<MarkdownEditor hideTitleHeading={true} nodeId="node-1" onChange={onChange} value="a" />);

    expect(mockCtor).toHaveBeenCalledTimes(1);
    expect(mockSetHideTitleHeading).toHaveBeenCalledWith(true);
  });

  it('refreshes image cloze presentation when external image regions are registered', async () => {
    renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://hash-1.png)" />);

    await waitFor(() => {
      expect(mockSetNodeId).toHaveBeenCalledWith('node-1');
    });

    act(() => {
      registerImageClozeEditorPresentation('node-1', {
        canCreate: true,
        focusRegionId: null,
        hiddenRegionIds: ['region-1'],
        outlinedRegionIds: [],
        regions: [
          {
            attachmentId: 'hash-1',
            height: 0.2,
            id: 'region-1',
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        ]
      });
    });

    await waitFor(() => {
      expect(mockRefreshImageClozePresentation).toHaveBeenCalled();
    });

    act(() => {
      unregisterImageClozeEditorPresentation('node-1');
    });
  });
});

function runLeftDownGestureTest() {
  mockGetScrollMetrics.mockReturnValue({ clientHeight: 300, scrollHeight: 1200, scrollTop: 420 });
  const onContextMenu = vi.fn();
  const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />);

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
  const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />);

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
  const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />);

  const surface = container.firstChild as HTMLElement;
  dispatchSurfaceEvent(surface, new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 120, clientY: 120 }));
  dispatchSurfaceEvent(surface, new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 120, clientY: 120 }));

  expect(mockSetScrollTop).not.toHaveBeenCalled();
  expect(onContextMenu).toHaveBeenCalledTimes(1);
}

function runOneStrokeGestureStyleTest() {
  setEditorMouseGestureAction('right', 'scroll-top');
  setEditorMouseGestureTrailColor('#ff5500');
  setEditorMouseGestureTrailLineWidth(5);
  setEditorMouseGestureTrailOpacity(0.6);
  const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />);

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

function runSettingsSectionIntegrationTest() {
  const { container } = renderWithMouseGestureProvider(
    <>
      <SettingsMouseGesturesSection />
      <MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />
    </>
  );

  fireEvent.change(screen.getByLabelText('Right mouse gesture action'), {
    target: { value: 'scroll-top' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail color hex'), {
    target: { value: '#ff5500' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail line width'), {
    target: { value: '4' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail opacity'), {
    target: { value: '0.6' }
  });

  const editorSurface = container.querySelector('.markdown-editor-host')?.parentElement as HTMLElement;
  mockSurfaceRect(editorSurface);
  drawGesture(editorSurface, [
    new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2, clientX: 180, clientY: 120 }),
    new MouseEvent('mousemove', { bubbles: true, button: 2, buttons: 2, clientX: 220, clientY: 120 })
  ]);

  const trail = container.querySelector('[data-editor-gesture-trail="true"]');
  expect(trail).toHaveAttribute('stroke', '#ff5500');
  expect(trail).toHaveAttribute('stroke-width', '4');
  expect(trail).toHaveAttribute('stroke-opacity', '0.6');

  drawGesture(editorSurface, [new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0, clientX: 220, clientY: 120 })]);
  expect(mockSetScrollTop).toHaveBeenCalledWith(0);
}

describe('MarkdownEditor mouse gestures', () => {
  resetMocks();

  beforeEach(() => {
    window.localStorage.clear();
    setEditorMouseGestureAction('right', DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.gestureActions.right);
    setEditorMouseGestureTrailColor(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor);
    setEditorMouseGestureTrailLineWidth(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailLineWidth);
    setEditorMouseGestureTrailOpacity(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailOpacity);
  });

  it('runs left-down gesture to scroll to bottom and suppresses context menu once', runLeftDownGestureTest);
  it('runs left-up gesture to scroll to top', runLeftUpGestureTest);
  it('keeps normal context menu behavior when no valid gesture is formed', runContextMenuFallbackTest);
  it('supports one-stroke gestures and uses custom trail styling', runOneStrokeGestureStyleTest);
  it('uses mouse gesture settings updated from the settings section immediately', runSettingsSectionIntegrationTest);
});
