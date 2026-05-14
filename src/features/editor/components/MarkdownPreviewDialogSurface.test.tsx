import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownImagePreviewDialog } from './MarkdownImagePreviewDialog';
import { MarkdownTablePreviewDialog } from './MarkdownTablePreviewDialog';

const TABLE_PREVIEW = {
  table: {
    active: false,
    anchorDecorations: [],
    columnCount: 1,
    from: 0,
    rows: [
      { cells: [{ align: null, from: 2, text: 'A', to: 3 }], from: 0, kind: 'header' as const, to: 5 },
      { cells: [{ align: null, from: 18, text: 'Alpha', to: 23 }], from: 16, kind: 'body' as const, to: 25 }
    ],
    to: 25
  }
};

function expectSharedPreviewOverlay() {
  const overlay = document.body.querySelector<HTMLElement>('.fixed.inset-0.z-modal-overlay');
  expect(overlay?.className).toContain('bg-[var(--app-floating-overlay-bg)]');
  expect(overlay?.className).not.toContain('bg-foreground/60');
}

describe('Markdown preview dialog surface', () => {
  it('keeps image preview overlay on shared theme-aware floating tokens', () => {
    render(
      <MarkdownImagePreviewDialog
        image={{ alt: 'Cover', presentation: null, src: 'https://example.com/cover.png' }}
        onOpenChange={vi.fn()}
      />
    );

    expectSharedPreviewOverlay();
  });

  it('keeps table preview overlay on shared theme-aware floating tokens', () => {
    render(<MarkdownTablePreviewDialog onOpenChange={vi.fn()} table={TABLE_PREVIEW} />);

    expectSharedPreviewOverlay();
  });
});
