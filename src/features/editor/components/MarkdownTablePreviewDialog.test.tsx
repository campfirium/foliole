import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownTablePreviewDialog } from './MarkdownTablePreviewDialog';

const ALIGNED_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 3,
    from: 0,
    rows: [
      {
        cells: [
          { align: 'left' as const, from: 2, text: 'A', to: 3 },
          { align: 'right' as const, from: 6, text: 'B', to: 7 },
          { align: 'center' as const, from: 10, text: 'C', to: 11 }
        ],
        from: 0,
        kind: 'header' as const,
        to: 13
      },
      {
        cells: [
          { align: 'left' as const, from: 40, text: '1', to: 41 },
          { align: 'right' as const, from: 44, text: '2', to: 45 },
          { align: 'center' as const, from: 48, text: '3', to: 49 }
        ],
        from: 38,
        kind: 'body' as const,
        to: 51
      }
    ],
    to: 51
  }
};

const SOURCE_HIGHLIGHT_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      { cells: [{ align: null, from: 18, text: '==Marked==', to: 28 }], from: 16, kind: 'body' as const, to: 30 }
    ],
    to: 30
  }
};

const EMPHASIS_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      { cells: [{ align: null, from: 18, text: '*Marked*', to: 26 }], from: 16, kind: 'body' as const, to: 28 }
    ],
    to: 28
  }
};

const INLINE_LINK_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      {
        cells: [{ align: null, from: 18, text: '[docs](https://example.com)', to: 45 }],
        from: 16,
        kind: 'body' as const,
        to: 47
      }
    ],
    to: 47
  }
};

const WIKI_LINK_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      {
        cells: [{ align: null, from: 18, text: '[[Folder/Card]]', to: 33 }],
        from: 16,
        kind: 'body' as const,
        to: 35
      }
    ],
    to: 35
  }
};

const FOOTNOTE_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      {
        cells: [{ align: null, from: 18, text: 'Cell ^[1]{note} text', to: 38 }],
        from: 16,
        kind: 'body' as const,
        to: 40
      }
    ],
    to: 40
  }
};

const ANCHORED_TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [
      { from: 18, kind: 'highlight' as const, to: 23 },
      { from: 27, kind: 'cloze' as const, to: 31 }
    ],
    columnCount: 2,
    from: 0,
    rows: [
      {
        cells: [
          { align: null, from: 2, text: 'A', to: 3 },
          { align: null, from: 6, text: 'B', to: 7 }
        ],
        from: 0,
        kind: 'header' as const,
        to: 9
      },
      {
        cells: [
          { align: null, from: 18, text: 'Alpha', to: 23 },
          { align: null, from: 27, text: 'Beta', to: 31 }
        ],
        from: 16,
        kind: 'body' as const,
        to: 33
      }
    ],
    to: 33
  }
};

describe('MarkdownTablePreviewDialog', () => {
  it('applies GFM table alignment inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={ALIGNED_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    const cells = Array.from(dialog.querySelectorAll('td'));
    expect(cells.map((cell) => (cell as HTMLElement).style.textAlign)).toEqual(['left', 'right', 'center']);
  });

  it('renders OB-like source highlights inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={SOURCE_HIGHLIGHT_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td .cm-md-source-highlight')?.textContent).toBe('Marked');
    expect(screen.getByRole('cell', { name: 'Marked' })).toBeInTheDocument();
  });

  it('renders GFM emphasis inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={EMPHASIS_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td .cm-md-emphasis')?.textContent).toBe('Marked');
    expect(screen.getByRole('cell', { name: 'Marked' })).toBeInTheDocument();
  });

  it('renders GFM inline links inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={INLINE_LINK_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td [data-md-link-url="https://example.com"]')?.textContent).toBe('docs');
    expect(screen.getByRole('cell', { name: 'docs' })).toBeInTheDocument();
  });

  it('renders OB-like wiki links inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={WIKI_LINK_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td [data-md-link-node-title="Folder/Card"]')?.textContent).toBe('Folder/Card');
    expect(screen.getByRole('cell', { name: 'Folder/Card' })).toBeInTheDocument();
  });

  it('renders OB-like footnotes inside the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={FOOTNOTE_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    const footnote = dialog.querySelector<HTMLElement>('td .cm-md-footnote-widget');
    expect(footnote?.dataset.mdFootnoteLabel).toBe('1');
    expect(footnote?.dataset.mdFootnoteStatus).toBe('resolved');
    expect(dialog.querySelector('td')?.textContent).toBe('Cell 1 text');
  });

  it('projects table-scoped highlight and cloze decorations into the full table preview', async () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={ANCHORED_TABLE_PREVIEW} />);

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('td.cm-md-highlight')?.textContent).toBe('Alpha');
    expect(dialog.querySelector('td.cm-md-cloze')?.textContent).toBe('Beta');
  });
});
