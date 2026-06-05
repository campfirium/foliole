import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(host: HTMLElement, options: { initialContent: string }) {
      host.textContent = options.initialContent;
    }
    destroy() {}
    refreshImageClozePresentation() {}
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    setContent() {}
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setNodeId() {}
    setTextAnchorDecorations() {}
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor() {
  return render(
    <LocalizationProvider>
      <MouseGestureSettingsProvider>
        <MarkdownEditor nodeId="node-1" onChange={vi.fn()} scrollContainer="outer" value="Readable body" />
      </MouseGestureSettingsProvider>
    </LocalizationProvider>
  );
}

describe('MarkdownEditor outer scrolling', () => {
  it('marks the host and wrapper for companion reading surface scroll ownership', () => {
    const { container } = renderEditor();

    const host = container.querySelector('.markdown-editor-host');
    expect(host).toHaveAttribute('data-scroll-container', 'outer');
    expect(host?.parentElement).toHaveClass('overflow-visible');
  });
});
