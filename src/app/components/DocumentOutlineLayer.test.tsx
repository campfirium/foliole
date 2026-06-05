import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';
import { resolvePanelScrollTop } from './DocumentOutlineLayerModel';
import * as outlineModel from './DocumentOutlineLayerModel';

function renderOutline(content: string, anchorPosition = 0, documentMaxWidth = 860) {
  return renderWithLocalization(
    <DocumentOutlineLayer
      content={content}
      documentMaxWidth={documentMaxWidth}
      onRevealPosition={vi.fn()}
      onResolveDocumentPositionAtViewportY={() => anchorPosition}
    />
  );
}

function advanceOutlineOpenDelay() {
  act(() => {
    vi.advanceTimersByTime(120);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DocumentOutlineLayer', () => {
  it('stays hidden when there are no headings', () => {
    renderOutline('Plain paragraph');

    expect(screen.queryByLabelText('Document outline hover zone')).not.toBeInTheDocument();
  });

  it('reveals outline on hover and navigates to the selected heading', () => {
    vi.useFakeTimers();
    const onRevealPosition = vi.fn();
    renderWithLocalization(
      <DocumentOutlineLayer
        content={'# Intro\n## Deep dive'}
        documentMaxWidth={860}
        onRevealPosition={onRevealPosition}
        onResolveDocumentPositionAtViewportY={() => 11}
      />
    );

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);
    advanceOutlineOpenDelay();

    fireEvent.click(screen.getByRole('button', { name: 'Deep dive' }));

    expect(onRevealPosition).toHaveBeenCalledWith(11);
  });

  it('defers outline parsing until the hover zone is actually used', () => {
    const resolveDisplayItemsSpy = vi.spyOn(outlineModel, 'resolveDisplayItems');
    renderOutline('# Intro\n## Deep dive', 11);

    expect(resolveDisplayItemsSpy).not.toHaveBeenCalled();

    vi.useFakeTimers();
    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(resolveDisplayItemsSpy).toHaveBeenCalledTimes(1);
  });

  it('hides outline entries after leaving the hover zone', () => {
    vi.useFakeTimers();
    renderOutline('# Intro\n## Deep dive', 11);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);
    advanceOutlineOpenDelay();
    const listShell = screen.getByLabelText('Topic outline').parentElement;
    expect(listShell).toHaveAttribute('aria-hidden', 'false');
    fireEvent.mouseLeave(hoverZone);

    expect(listShell).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('DocumentOutlineLayer content', () => {
  it('does not render the first heading as an outline entry', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 16);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.queryByRole('button', { name: 'Article Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deep dive' })).toBeInTheDocument();
  });

  it('opens for strong-wrapped ATX compatibility headings', () => {
    vi.useFakeTimers();
    renderOutline('**# Article Title**\n**## Deep dive**', 20);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.queryByRole('button', { name: 'Article Title' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deep dive' })).toBeInTheDocument();
  });

  it('keeps the outline at a fixed top offset on the right edge', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 30);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    Object.defineProperty(hoverZone, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 600 })
    });

    fireEvent.mouseEnter(hoverZone, { clientY: 360 });
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline').parentElement).toHaveStyle({ top: '96px', bottom: '56px' });
  });

  it('renders the visible top outline level in bold even when headings start deeper', () => {
    vi.useFakeTimers();
    renderOutline('## Section\n### Detail', 3);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('font-bold');
  });
});

describe('DocumentOutlineLayer hover guard', () => {
  it('does not open while the cursor is only passing through the hover zone', () => {
    vi.useFakeTimers();
    renderOutline('# Intro\n## Deep dive', 11);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    fireEvent.mouseEnter(hoverZone);
    fireEvent.mouseLeave(hoverZone);
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('DocumentOutlineLayer hover alignment', () => {
  it('keeps the active heading visible without moving the panel to the cursor height', () => {
    expect(resolvePanelScrollTop(420, 452, 120, 220, 24)).toBe(256);
    expect(resolvePanelScrollTop(150, 164, 120, 220, 24)).toBe(120);
  });

  it('scrolls the active heading into the fixed outline viewport', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 11);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    Object.defineProperty(hoverZone, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, height: 600, width: 220 })
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 220
    });
    Object.defineProperty(HTMLButtonElement.prototype, 'offsetTop', {
      configurable: true,
      get: () => 480
    });

    fireEvent.mouseEnter(hoverZone, { clientY: 360 });
    advanceOutlineOpenDelay();

    const entries = screen.getByLabelText('Topic outline');
    const panel = entries.parentElement as HTMLDivElement;

    expect(entries).toHaveClass('py-1');
    expect(panel.scrollTop).toBe(504);
  });
});

describe('DocumentOutlineLayer gutter styling', () => {
  it('keeps the closed hover zone aligned with the document right gutter', () => {
    renderOutline('# Article Title\n## Deep dive', 11, 860);

    expect(screen.getByLabelText('Document outline hover zone')).toHaveStyle({
      width: 'max(72px, calc((100% - 860px) / 2 + 72px))'
    });
  });

  it('keeps outline content inside the gutter beside the document', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive', 11, 860);

    const hoverZone = screen.getByLabelText('Document outline hover zone');
    Object.defineProperty(hoverZone.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 1200 })
    });

    fireEvent.mouseEnter(hoverZone);
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline').parentElement).toHaveStyle({
      right: '16.5px',
      width: '148.5px'
    });
  });

  it('uses a stronger hover color for inactive entries', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.getByRole('button', { name: 'Detail' })).toHaveClass('hover:text-foreground/90');
  });

  it('renders outline entries in a scrollable container', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline').parentElement).toHaveClass('scrollbar-hidden', 'overflow-y-auto');
  });

  it('removes default list indentation so the first item starts at the gutter edge', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline').querySelector('ol')).toHaveClass('m-0', 'list-none', 'p-0');
  });

  it('does not add cursor-alignment slack around the outline entries', () => {
    vi.useFakeTimers();
    renderOutline('# Article Title\n## Deep dive\n### Detail', 0);

    fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
    advanceOutlineOpenDelay();

    expect(screen.getByLabelText('Topic outline')).toHaveClass('py-1');
  });
});
