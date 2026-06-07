import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bindMermaidFunctions, initializeMermaid, renderMermaid } = vi.hoisted(() => {
  const bindFunctions = vi.fn();
  return {
    bindMermaidFunctions: bindFunctions,
    initializeMermaid: vi.fn(),
    renderMermaid: vi.fn(async (id: string, source: string) => ({
      bindFunctions,
      svg: `<svg data-mermaid-id="${id}"><text>${source}</text></svg>`
    }))
  };
});

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMermaid,
    render: renderMermaid
  }
}));

import { renderWithLocalization } from '../../../shared/localization/testLocalization';

import { MarkdownMermaidPreviewDialog } from './MarkdownMermaidPreviewDialog';

beforeEach(() => {
  bindMermaidFunctions.mockClear();
  initializeMermaid.mockClear();
  renderMermaid.mockClear();
});

describe('MarkdownMermaidPreviewDialog', () => {
  it('renders diagram preview in the shared centered preview dialog', async () => {
    renderWithLocalization(<MarkdownMermaidPreviewDialog diagram={{ source: 'gantt\n  title Plan' }} onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.cm-md-mermaid-preview svg')).not.toBeNull();
    });
    expect(initializeMermaid).toHaveBeenCalledWith(expect.objectContaining({
      htmlLabels: false,
      securityLevel: 'strict',
      startOnLoad: false
    }));
    expect(bindMermaidFunctions).toHaveBeenCalledWith(dialog.querySelector('.cm-md-mermaid-preview'));
    expect(dialog.textContent).toContain('gantt');
    expect(dialog.querySelector('[data-md-mermaid-kind="gantt"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('centers non-gantt diagrams in the same preview shell', async () => {
    renderWithLocalization(<MarkdownMermaidPreviewDialog diagram={{ source: 'quadrantChart\n  title Positioning' }} onOpenChange={vi.fn()} />);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog.querySelector('.cm-md-mermaid-preview svg')).not.toBeNull();
    });
    expect(dialog.querySelector('[data-md-mermaid-kind="quadrantchart"]')).not.toBeNull();
    expect(dialog.querySelector('[data-md-mermaid-kind="quadrantchart"]')?.className).toContain('justify-center');
    expect((dialog.querySelector('.cm-md-mermaid-preview svg') as SVGElement | null)?.style.width).toContain('76vh');
  });
});
