import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { renderMermaid } = vi.hoisted(() => ({
  renderMermaid: vi.fn(async (id: string, source: string) => ({
    bindFunctions: undefined,
    svg: `<svg data-mermaid-id="${id}"><text>${source}</text></svg>`
  }))
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMermaid
  }
}));

import { MarkdownMermaidPreviewDialog } from './MarkdownMermaidPreviewDialog';

describe('MarkdownMermaidPreviewDialog', () => {
  it('renders diagram preview in the shared centered preview dialog', async () => {
    render(<MarkdownMermaidPreviewDialog diagram={{ source: 'gantt\n  title Plan' }} onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.cm-md-mermaid-preview svg')).not.toBeNull();
    });
    expect(dialog.textContent).toContain('gantt');
    expect(dialog.querySelector('[data-md-mermaid-kind="gantt"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('centers non-gantt diagrams in the same preview shell', async () => {
    render(<MarkdownMermaidPreviewDialog diagram={{ source: 'quadrantChart\n  title Positioning' }} onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.cm-md-mermaid-preview svg')).not.toBeNull();
    });
    expect(dialog.querySelector('[data-md-mermaid-kind="quadrantchart"]')).not.toBeNull();
    expect(dialog.querySelector('[data-md-mermaid-kind="quadrantchart"]')?.className).toContain('justify-center');
    expect((dialog.querySelector('.cm-md-mermaid-preview svg') as SVGElement | null)?.style.width).toContain('76vh');
  });
});
