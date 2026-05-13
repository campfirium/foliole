import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerImageClozeEditorPresentation,
  unregisterImageClozeEditorPresentation
} from '../../image-cloze/model/imageClozePresentation';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';
import { MARKDOWN_IMAGE_PREVIEW_EVENT } from '../model/markdownImagePreview';
import { MARKDOWN_TABLE_PREVIEW_EVENT } from '../model/markdownTablePreview';

const mockDestroy = vi.fn();
const mockGetScrollMetrics = vi.fn(() => ({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 }));
const mockGetContent = vi.fn(() => '');
const mockSetNodeId = vi.fn();
const mockRefreshImageClozePresentation = vi.fn();
const mockOnScroll = vi.fn(() => () => undefined);
const mockCtor = vi.fn();

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor(host: HTMLElement, options: { initialContent: string; onChange?: (content: string) => void }) {
      mockCtor(host, options);
    }
    destroy() { mockDestroy(); }
    focus() {}
    getContent() { return mockGetContent(); }
    getDocumentPositionAtViewportY() { return 0; }
    getLineBlockHeight() { return 24; }
    setContent() {}
    setDiffDecorations() {}
    setSearchDecorations() {}
    setTextAnchorDecorations() {}
    setHideTitleHeading() {}
    setNodeId(nodeId: string | null) { mockSetNodeId(nodeId); }
    refreshImageClozePresentation() { mockRefreshImageClozePresentation(); }
    getSelection() { return { from: 0, to: 0 }; }
    setParagraphMarker() {}
    setSelection() {}
    restoreSelection() {}
    revealSelection() {}
    getScrollTop() { return 0; }
    setScrollTop() {}
    getScrollMetrics() { return mockGetScrollMetrics(); }
    replaceSelection() {}
    replaceRange() {}
    onContentChange() { return () => undefined; }
    onScroll() { return mockOnScroll(); }
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderWithMouseGestureProvider(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>
  });
}

const SIMPLE_TABLE_PREVIEW_DETAIL = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ from: 2, text: 'A', to: 3 }], from: 0, kind: 'header', to: 5 },
      { cells: [{ from: 18, text: 'Alpha', to: 23 }], from: 16, kind: 'body', to: 25 }
    ],
    to: 25
  }
};

const INLINE_TABLE_PREVIEW_DETAIL = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ from: 2, text: 'A', to: 3 }], from: 0, kind: 'header', to: 5 },
      { cells: [{ from: 18, text: '**Alpha**', to: 27 }], from: 16, kind: 'body', to: 29 }
    ],
    to: 29
  }
};

const WEIGHTED_TABLE_PREVIEW_DETAIL = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 3,
    from: 0,
    rows: [
      {
        cells: [
          { from: 2, text: 'ID', to: 4 },
          { from: 7, text: 'Description', to: 18 },
          { from: 21, text: 'State', to: 26 }
        ],
        from: 0,
        kind: 'header',
        to: 28
      },
      {
        cells: [
          { from: 32, text: 'A', to: 33 },
          { from: 36, text: 'A long paragraph-like table value that should receive more column width', to: 102 },
          { from: 105, text: 'Done', to: 109 }
        ],
        from: 30,
        kind: 'body',
        to: 111
      }
    ],
    to: 111
  }
};

function dispatchTablePreview(host: HTMLDivElement | null, detail: unknown) {
  host?.dispatchEvent(new CustomEvent(MARKDOWN_TABLE_PREVIEW_EVENT, { bubbles: true, detail }));
}

beforeEach(() => {
  mockCtor.mockClear();
  mockDestroy.mockClear();
  mockGetContent.mockClear();
  mockSetNodeId.mockClear();
  mockRefreshImageClozePresentation.mockClear();
  mockOnScroll.mockClear();
});

describe('MarkdownEditor image preview', () => {
  it('opens and closes the image preview dialog when the editor surface receives a preview request', async () => {
    const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://hash-1.png)" />);
    const host = container.querySelector('.markdown-editor-host') as HTMLDivElement | null;

    act(() => {
      host?.dispatchEvent(
        new CustomEvent(MARKDOWN_IMAGE_PREVIEW_EVENT, {
          bubbles: true,
          detail: { alt: 'Cover', presentation: null, src: 'https://example.com/cover.png' }
        })
      );
    });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cover' })).toHaveAttribute('src', 'https://example.com/cover.png');

    act(() => {
      screen.getByRole('button', { name: 'Close image preview' }).click();
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes the image preview dialog when clicking outside the image', async () => {
    const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="![Cover](asset://hash-1.png)" />);
    const host = container.querySelector('.markdown-editor-host') as HTMLDivElement | null;

    act(() => {
      host?.dispatchEvent(
        new CustomEvent(MARKDOWN_IMAGE_PREVIEW_EVENT, {
          bubbles: true,
          detail: { alt: 'Cover', presentation: null, src: 'https://example.com/cover.png' }
        })
      );
    });

    const dialog = await screen.findByRole('dialog');
    const dismissSurface = dialog.querySelector('.cursor-zoom-out') as HTMLDivElement | null;

    act(() => {
      dismissSurface?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('MarkdownEditor table preview', () => {
  it('opens the table preview dialog when the editor surface receives a preview request', async () => {
    const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="| A |\n| --- |\n| Alpha |" />);
    const host = container.querySelector('.markdown-editor-host') as HTMLDivElement | null;

    act(() => {
      dispatchTablePreview(host, SIMPLE_TABLE_PREVIEW_DETAIL);
    });

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Alpha' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Close table preview' })).not.toBeInTheDocument();
  });

  it('sizes table preview columns from their content weight', async () => {
    const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="| ID | Description | State |" />);
    const host = container.querySelector('.markdown-editor-host') as HTMLDivElement | null;

    act(() => {
      dispatchTablePreview(host, WEIGHTED_TABLE_PREVIEW_DETAIL);
    });

    const dialog = await screen.findByRole('dialog');
    const widths = Array.from(dialog.querySelectorAll('col')).map((column) => Number.parseFloat((column as HTMLTableColElement).style.width));
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
    expect(widths[1]!).toBeGreaterThan(widths[2]!);
  });

  it('renders inline markdown inside the table preview dialog', async () => {
    const { container } = renderWithMouseGestureProvider(<MarkdownEditor nodeId="node-1" onChange={vi.fn()} value="| A |" />);
    const host = container.querySelector('.markdown-editor-host') as HTMLDivElement | null;

    act(() => {
      dispatchTablePreview(host, INLINE_TABLE_PREVIEW_DETAIL);
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td .cm-md-strong')?.textContent).toBe('Alpha');
    expect(screen.getByRole('cell', { name: 'Alpha' })).toBeInTheDocument();
  });
});

describe('MarkdownEditor image cloze refresh', () => {
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
          { attachmentId: 'hash-1', height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.2 }
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
