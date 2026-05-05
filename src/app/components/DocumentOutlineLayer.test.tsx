import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';

function renderOutline(content: string, anchorPosition = 0) {
  return render(
    <DocumentOutlineLayer
      content={content}
      onResolveDocumentPositionAtViewportY={() => anchorPosition}
      onRevealSelection={vi.fn()}
    />
  );
}

describe('DocumentOutlineLayer', () => {
  it('stays hidden when there are no headings', () => {
    renderOutline('Plain paragraph');

    expect(screen.queryByLabelText('Document outline hover zone')).not.toBeInTheDocument();
  });

  it('reveals outline on hover and navigates to the selected heading', () => {
    const onRevealSelection = vi.fn();
    render(
      <DocumentOutlineLayer
        content={'# Intro\n## Deep dive'}
        onResolveDocumentPositionAtViewportY={() => 11}
        onRevealSelection={onRevealSelection}
      />
    );

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);

    fireEvent.click(screen.getByRole('button', { name: 'Deep dive' }));

    expect(onRevealSelection).toHaveBeenCalledWith({ from: 11, to: 20 });
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

    expect(screen.getByLabelText('Document outline entries').parentElement).toHaveStyle('top: 260px');
  });
});
