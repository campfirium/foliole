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
});
