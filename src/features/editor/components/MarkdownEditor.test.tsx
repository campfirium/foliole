import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('MarkdownEditor', () => {
  beforeEach(() => {
    mockCtor.mockClear();
    mockDestroy.mockClear();
    mockGetContent.mockClear();
    mockSetContent.mockClear();
    mockSetSelection.mockClear();
    mockSetScrollTop.mockClear();
    mockOnScroll.mockClear();
  });

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
