import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { PublicCommandProvider } from '../../../shared/commands/publicCommandContext';
import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';
import {
  DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS,
  setEditorMouseGestureBinding,
  setEditorMouseGestureTrailColor,
  setEditorMouseGestureTrailLineWidth,
  setEditorMouseGestureTrailOpacity
} from '../model/editorMouseGestureSettings';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetContent = vi.fn();
const mockSetDiffDecorations = vi.fn();
const mockSetSearchDecorations = vi.fn();
const mockSetHideTitleHeading = vi.fn();
const mockSetNodeId = vi.fn();
const mockRefreshImageClozePresentation = vi.fn();
const mockSetSelection = vi.fn();
const mockSetScrollTop = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);
const mockCtor = vi.fn();
const mockRunCommand = vi.fn();
const PUBLIC_COMMAND_IDS = new Set<string>([
  APP_COMMAND_IDS.scrollDocumentTop,
  APP_COMMAND_IDS.scrollDocumentBottom,
  APP_COMMAND_IDS.openWorkspaceSearch
]);

function createMockCodeMirrorEditorAdapterClass() {
  return class {
    constructor(host: HTMLElement, options: { initialContent: string; onChange?: (content: string) => void }) {
      mockCtor(host, options);
    }
    destroy() { mockDestroy(); }
    focus() {}
    getContent() { return mockGetContent(); }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent(content: string) { mockSetContent(content); }
    setDiffDecorations(diffDecorations: unknown) { mockSetDiffDecorations(diffDecorations); }
    setSearchDecorations(searchDecorations: unknown) { mockSetSearchDecorations(searchDecorations); }
    setTextAnchorDecorations() {}
    setHideTitleHeading(value: boolean) { mockSetHideTitleHeading(value); }
    setNodeId(nodeId: string | null) { mockSetNodeId(nodeId); }
    refreshImageClozePresentation() { mockRefreshImageClozePresentation(); }
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection(selection: { from: number; to: number }) { mockSetSelection(selection); }
    restoreSelection() {}
    revealSelection() {}
    getScrollTop() { return 0; }
    setScrollTop(scrollTop: number) { mockSetScrollTop(scrollTop); }
    getScrollMetrics() { return mockGetScrollMetrics(); }
    replaceSelection() {}
    replaceRange() {}
    onContentChange() { return () => undefined; }
    onScroll() { return mockOnScroll(); }
  };
}

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: createMockCodeMirrorEditorAdapterClass()
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  const runCommand = (commandId: string) => {
    if (!PUBLIC_COMMAND_IDS.has(commandId)) return;
    mockRunCommand(commandId);
    if (commandId === APP_COMMAND_IDS.scrollDocumentTop) mockSetScrollTop(0);
    if (commandId === APP_COMMAND_IDS.scrollDocumentBottom) {
      const metrics = mockGetScrollMetrics();
      mockSetScrollTop(metrics.scrollHeight - metrics.clientHeight);
    }
  };
  return render(ui, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <PublicCommandProvider
          items={[
            {
              enabled: true,
              id: APP_COMMAND_IDS.scrollDocumentTop,
              title: 'Scroll to Document Top'
            },
            {
              enabled: true,
              id: APP_COMMAND_IDS.scrollDocumentBottom,
              title: 'Scroll to Document Bottom'
            },
            { enabled: true, id: APP_COMMAND_IDS.openWorkspaceSearch, title: 'Search' }
          ]}
          runCommand={runCommand}
        >
          <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
        </PublicCommandProvider>
      </LocalizationProvider>
    )
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

function mouse(type: string, clientX: number, clientY: number, buttons = 2) {
  return new MouseEvent(type, { bubbles: true, button: 2, buttons, clientX, clientY });
}

beforeEach(() => {
  mockCtor.mockClear();
  mockDestroy.mockClear();
  mockGetContent.mockClear();
  mockSetContent.mockClear();
  mockSetDiffDecorations.mockClear();
  mockSetSearchDecorations.mockClear();
  mockSetHideTitleHeading.mockClear();
  mockSetNodeId.mockClear();
  mockRefreshImageClozePresentation.mockClear();
  mockSetSelection.mockClear();
  mockSetScrollTop.mockClear();
  mockOnScroll.mockClear();
  mockRunCommand.mockClear();
  window.localStorage.clear();
  setEditorMouseGestureTrailColor(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailColor);
  setEditorMouseGestureTrailLineWidth(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailLineWidth);
  setEditorMouseGestureTrailOpacity(DEFAULT_EDITOR_MOUSE_GESTURE_SETTINGS.trailOpacity);
});

function runLeftDownGestureTest() {
  mockGetScrollMetrics.mockReturnValue({ clientHeight: 300, scrollHeight: 1200, scrollTop: 420 });
  const onContextMenu = vi.fn();
  const { container } = renderWithMouseGestureProvider(
    <MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />
  );

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    mouse('mousedown', 200, 200),
    mouse('mousemove', 160, 200),
    mouse('mousemove', 160, 240)
  ]);

  expect(container.querySelector('[data-editor-gesture-trail="true"]')).not.toBeNull();
  drawGesture(surface, [mouse('mouseup', 160, 240, 0)]);
  dispatchSurfaceEvent(surface, mouse('contextmenu', 160, 240, 0));

  expect(mockSetScrollTop).toHaveBeenCalledWith(900);
  expect(onContextMenu).not.toHaveBeenCalled();
  expect(container.querySelector('[data-editor-gesture-trail="true"]')).toBeNull();
}

function runLeftUpGestureTest() {
  mockGetScrollMetrics.mockReturnValue({ clientHeight: 250, scrollHeight: 1000, scrollTop: 0 });
  const { container } = renderWithMouseGestureProvider(
    <MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />
  );

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    mouse('mousedown', 220, 220),
    mouse('mousemove', 180, 220),
    mouse('mousemove', 180, 180),
    mouse('mouseup', 180, 180, 0)
  ]);

  expect(mockSetScrollTop).toHaveBeenCalledWith(0);
}

function runContextMenuFallbackTest() {
  const onContextMenu = vi.fn();
  const { container } = renderWithMouseGestureProvider(
    <MarkdownEditor nodeId="node-1" onChange={vi.fn()} onContextMenu={onContextMenu} value="a" />
  );

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  dispatchSurfaceEvent(surface, mouse('mousedown', 120, 120));
  dispatchSurfaceEvent(surface, mouse('contextmenu', 120, 120, 0));
  drawGesture(surface, [mouse('mouseup', 120, 120, 0)]);

  expect(mockSetScrollTop).not.toHaveBeenCalled();
  expect(onContextMenu).toHaveBeenCalledTimes(1);
}

function runOneStrokeGestureStyleTest() {
  setEditorMouseGestureBinding('right', APP_COMMAND_IDS.scrollDocumentTop);
  setEditorMouseGestureTrailColor('#ff5500');
  setEditorMouseGestureTrailLineWidth(5);
  setEditorMouseGestureTrailOpacity(0.6);
  const { container } = renderWithMouseGestureProvider(
    <MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="a" />
  );

  const surface = container.firstChild as HTMLElement;
  mockSurfaceRect(surface);
  drawGesture(surface, [
    mouse('mousedown', 180, 120),
    mouse('mousemove', 220, 120)
  ]);

  const trail = container.querySelector('[data-editor-gesture-trail="true"]');
  expect(trail).toHaveAttribute('stroke', '#ff5500');
  expect(trail).toHaveAttribute('stroke-width', '5');
  expect(trail).toHaveAttribute('stroke-opacity', '0.6');

  drawGesture(surface, [mouse('mouseup', 220, 120, 0)]);
  expect(mockSetScrollTop).toHaveBeenCalledWith(0);
}

describe('MarkdownEditor mouse gestures', () => {
  it(
    'runs left-down gesture to scroll to bottom and suppresses context menu once',
    runLeftDownGestureTest
  );
  it('runs left-up gesture to scroll to top', runLeftUpGestureTest);
  it(
    'keeps normal context menu behavior when no valid gesture is formed',
    runContextMenuFallbackTest
  );
  it('supports one-stroke gestures and uses custom trail styling', runOneStrokeGestureStyleTest);
});
