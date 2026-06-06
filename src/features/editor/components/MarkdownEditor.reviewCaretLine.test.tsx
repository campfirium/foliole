import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
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

function renderEditor(reviewCaretLineHighlight: boolean, reviewEscapeBlurEnabled = reviewCaretLineHighlight) {
  return render(
    <LocalizationProvider>
      <MouseGestureSettingsProvider>
        <MarkdownEditor
          nodeId="node-1"
          onChange={vi.fn()}
          reviewCaretLineHighlight={reviewCaretLineHighlight}
          reviewEscapeBlurEnabled={reviewEscapeBlurEnabled}
          value="Alpha"
        />
      </MouseGestureSettingsProvider>
    </LocalizationProvider>
  );
}

describe('MarkdownEditor review caret-line hint', () => {
  it('marks the editor host only when the review caret-line hint is enabled', () => {
    const view = renderEditor(true);

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'true');

    view.rerender(
      <LocalizationProvider>
        <MouseGestureSettingsProvider>
          <MarkdownEditor
            nodeId="node-1"
            onChange={vi.fn()}
            reviewCaretLineHighlight={false}
            reviewEscapeBlurEnabled={false}
            value="Alpha"
          />
        </MouseGestureSettingsProvider>
      </LocalizationProvider>
    );

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'false');
  });

  it('blurs review editor Escape without consuming the global Escape event', () => {
    const view = renderEditor(false, true);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editable = document.createElement('div');
    const globalEscape = vi.fn();
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    host.append(editable);
    editable.focus();
    window.addEventListener('keydown', globalEscape);

    const wasNotPrevented = fireEvent.keyDown(editable, { key: 'Escape', cancelable: true });

    window.removeEventListener('keydown', globalEscape);
    expect(document.activeElement).not.toBe(editable);
    expect(host).toHaveAttribute('data-review-caret-line', 'false');
    expect(host).toHaveAttribute('data-review-escape-blur', 'true');
    expect(wasNotPrevented).toBe(true);
    expect(globalEscape).toHaveBeenCalledTimes(1);
  });
});
