import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

const BROKEN_MARKER = 'BROKEN-DOCUMENT';

function assertRenderable(content: string) {
  if (content.includes(BROKEN_MARKER)) {
    throw new RangeError('Decorations that replace line breaks may not be specified via plugins');
  }
}

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    content: string;
    constructor(host: HTMLElement, options?: { initialContent?: string }) {
      this.content = options?.initialContent ?? '';
      assertRenderable(this.content);
      host.setAttribute('data-testid', 'live-editor');
    }
    destroy() {}
    focus() {}
    getContent() { return this.content; }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    getScrollTop() { return 0; }
    getSelection() { return { from: 0, to: 0 }; }
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    replaceRange() {}
    replaceSelection() {}
    restoreSelection() {}
    revealSelection() {}
    setContent(content: string) { assertRenderable(content); this.content = content; }
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setNodeId() {}
    setParagraphMarker() {}
    setScrollTop() {}
    setSelection() {}
    setTextAnchorDecorations() {}
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function Workspace(props: { nodeId: string; value: string }) {
  return (
    <LocalizationProvider>
      <MouseGestureSettingsProvider>
        <nav>Sidebar</nav>
        <MarkdownEditor nodeId={props.nodeId} onChange={() => undefined} value={props.value} />
      </MouseGestureSettingsProvider>
    </LocalizationProvider>
  );
}

const brokenTopic = `# Imported\n\n[foo]:\n  ${BROKEN_MARKER}\n`;

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps the rest of the workspace usable when a topic cannot be rendered on open', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<Workspace nodeId="broken" value={brokenTopic} />);

  expect(screen.getByText('Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent("This content can't be displayed");
  expect(screen.getByRole('alert')).toHaveTextContent(BROKEN_MARKER);
  expect(screen.queryByTestId('live-editor')).not.toBeInTheDocument();
});

it('recovers the editor after switching away from a topic that failed to render', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const view = render(<Workspace nodeId="healthy" value="# Healthy" />);
  expect(screen.getByTestId('live-editor')).toBeInTheDocument();

  view.rerender(<Workspace nodeId="broken" value={brokenTopic} />);
  expect(screen.getByText('Sidebar')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();

  view.rerender(<Workspace nodeId="other" value="# Other" />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByTestId('live-editor')).toBeInTheDocument();
});
