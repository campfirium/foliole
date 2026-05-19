import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor() {}
    destroy() {}
    getContent() { return ''; }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    refreshImageClozePresentation() {}
    setContent() {}
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setNodeId() {}
    setReadOnly() {}
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor(reviewCaretLineHighlight: boolean) {
  return render(
    <MouseGestureSettingsProvider>
      <MarkdownEditor
        nodeId="node-1"
        onChange={vi.fn()}
        reviewCaretLineHighlight={reviewCaretLineHighlight}
        value="Alpha"
      />
    </MouseGestureSettingsProvider>
  );
}

describe('MarkdownEditor review caret-line hint', () => {
  it('marks the editor host only when the review caret-line hint is enabled', () => {
    const view = renderEditor(true);

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'true');

    view.rerender(
      <MouseGestureSettingsProvider>
        <MarkdownEditor
          nodeId="node-1"
          onChange={vi.fn()}
          reviewCaretLineHighlight={false}
          value="Alpha"
        />
      </MouseGestureSettingsProvider>
    );

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'false');
  });
});
