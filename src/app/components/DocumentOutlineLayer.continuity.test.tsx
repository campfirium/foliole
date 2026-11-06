import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentOutlineLayer } from './DocumentOutlineLayer';
import * as outlineModel from './DocumentOutlineLayerModel';

const reveal = vi.fn();
const outline = (content: string) => (
  <DocumentOutlineLayer content={content} documentMaxWidth={860}
    onRevealPosition={reveal} onResolveDocumentPositionAtViewportY={() => 0} />
);

function openOutline() {
  fireEvent.mouseEnter(screen.getByLabelText('Document outline hover zone'));
  act(() => vi.advanceTimersByTime(120));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  reveal.mockClear();
});

it('keeps an open outline current through body edits, heading rename and navigation', () => {
  vi.useFakeTimers();
  const view = renderWithLocalization(outline('# Title\n## Section\nBody'));
  openOutline();
  const shell = screen.getByLabelText('Topic outline').parentElement;
  expect(screen.getByRole('button', { name: 'Section' })).toBeVisible();

  const inserted = '# Title\nNew paragraph\n## Section\nBody';
  view.rerender(outline(inserted));
  expect(shell).toHaveAttribute('aria-hidden', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Section' }));
  expect(reveal).toHaveBeenLastCalledWith(inserted.indexOf('Section'));

  const renamed = inserted.replace('Section', 'Renamed');
  view.rerender(outline(renamed));
  expect(screen.queryByRole('button', { name: 'Section' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Renamed' }));
  expect(reveal).toHaveBeenLastCalledWith(renamed.indexOf('Renamed'));

  const removed = '# Title\n## Renamed\nBody';
  view.rerender(outline(removed));
  fireEvent.click(screen.getByRole('button', { name: 'Renamed' }));
  expect(reveal).toHaveBeenLastCalledWith(removed.indexOf('Renamed'));
});

it('shows valid empty content after deleting headings and current headings when they return', () => {
  vi.useFakeTimers();
  const view = renderWithLocalization(outline('# Title\n## First\n## Second'));
  openOutline();
  view.rerender(outline('# Title'));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(outline('Plain body'));
  expect(screen.queryByLabelText('Document outline hover zone')).not.toBeInTheDocument();

  view.rerender(outline('# New title\n## Returned'));
  openOutline();
  fireEvent.click(screen.getByRole('button', { name: 'Returned' }));
  expect(reveal).toHaveBeenLastCalledWith(15);
  expect(screen.queryByRole('button', { name: 'First' })).not.toBeInTheDocument();
});

it('keeps closed edits lazy and opens the latest content without stale entries', () => {
  vi.useFakeTimers();
  const parse = vi.spyOn(outlineModel, 'resolveDisplayItems');
  const view = renderWithLocalization(outline('# Title\n## First'));
  view.rerender(outline('# Title\n## Second'));
  expect(parse).not.toHaveBeenCalled();
  openOutline();
  expect(screen.getByRole('button', { name: 'Second' })).toBeVisible();
  fireEvent.mouseLeave(screen.getByLabelText('Document outline hover zone'));
  parse.mockClear();

  view.rerender(outline('# Title\n## Third'));
  view.rerender(outline('# Title\nParagraph\n## Latest'));
  expect(parse).not.toHaveBeenCalled();
  openOutline();
  expect(screen.queryByRole('button', { name: 'Second' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
  expect(reveal).toHaveBeenLastCalledWith(21);
});
