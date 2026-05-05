import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentOutlineLayer, resolvePanelScrollTop } from './DocumentOutlineLayer';

function renderOutline(content: string, anchorPosition = 0, documentMaxWidth = 860) {
  return render(
    <DocumentOutlineLayer
      content={content}
      documentMaxWidth={documentMaxWidth}
      onRevealPosition={vi.fn()}
      onResolveDocumentPositionAtViewportY={() => anchorPosition}
    />
  );
}

describe('DocumentOutlineLayer', () => {
  it('stays hidden when there are no headings', () => {
    renderOutline('Plain paragraph');

    expect(screen.queryByLabelText('Document outline hover zone')).not.toBeInTheDocument();
  });

  it('reveals outline on hover and navigates to the selected heading', () => {
    const onRevealPosition = vi.fn();
    render(
      <DocumentOutlineLayer
        content={'# Intro\n## Deep dive'}
        documentMaxWidth={860}
        onRevealPosition={onRevealPosition}
        onResolveDocumentPositionAtViewportY={() => 11}
      />
    );

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);

    fireEvent.click(screen.getByRole('button', { name: 'Deep dive' }));

    expect(onRevealPosition).toHaveBeenCalledWith(11);
  });

  it('hides outline entries after leaving the hover zone', () => {
    renderOutline('# Intro\n## Deep dive', 11);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);
    const listShell = screen.getByLabelText('Document outline entries').parentElement;
    expect(listShell).toHaveAttribute('aria-hidden', 'false');
    fireEvent.mouseLeave(hoverZone);

    expect(listShell).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not render the first heading as an outline entry', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 16);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.queryByRole('button', { name: 'Article Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deep dive' })).toBeInTheDocument();
  });

  it('anchors the outline to the hover position on the right edge', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 30);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    Object.defineProperty(hoverZone, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 600 })
    });

    fireEvent.mouseEnter(hoverZone, { clientY: 360 });

    expect(screen.getByLabelText('Document outline entries').parentElement).toHaveStyle({ top: '0px', bottom: '0px' });
  });

  it('renders the visible top outline level in bold even when headings start deeper', () => {
    renderOutline('## Section\n### Detail', 3);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('font-bold');
  });
});

describe('DocumentOutlineLayer hover alignment', () => {
  it('scrolls the matching heading to the hovered document height', () => {
    expect(resolvePanelScrollTop(260, 420, 220, 900)).toBe(160);
  });
});

describe('DocumentOutlineLayer gutter styling', () => {
  it('keeps outline content inside the gutter beside the document', () => {
    renderOutline('# Article Title\n## Deep dive', 11, 860);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    Object.defineProperty(hoverZone.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1200 })
    });

    fireEvent.mouseEnter(hoverZone);

    expect(screen.getByLabelText('Document outline entries').parentElement).toHaveStyle({
      right: '16.5px',
      width: '148.5px'
    });
  });

  it('uses a stronger hover color for inactive entries', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('hover:text-foreground/90');
  });

  it('renders outline entries in a scrollable container', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.getByLabelText('Document outline entries').parentElement).toHaveClass('scrollbar-hidden', 'overflow-y-auto');
  });

  it('removes default list indentation so the first item starts at the gutter edge', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.getByLabelText('Document outline entries').querySelector('ol')).toHaveClass('m-0', 'list-none', 'p-0');
  });

  it('adds bottom slack so late headings can still align to the cursor height', () => {
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));

    expect(screen.getByLabelText('Document outline entries')).toHaveStyle('padding-bottom: 0px');
  });
});
