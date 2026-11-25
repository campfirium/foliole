import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { CompanionReadingSessionHost } from './CompanionReadingSession';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

function ReadingRoute() {
  const [open, setOpen] = useState(true);
  const reading = useImmersiveReadableArticleState();
  if (!open) return <p>Search results</p>;
  return <ImmersiveChromeLayer
    actionsOpen={reading.isActionsSheetOpen} editor={null} isChromeVisible
    isContentEditing={reading.isContentEditing} onCancelContentEditing={reading.exitContentEditing} onExit={() => setOpen(false)}
    onFindInDocument={reading.openDocumentSearch}
    onOpenActions={reading.setIsActionsSheetOpen} onOpenOutline={reading.setIsOutlineOpen}
    onOpenReadingSheet={reading.setOpenReadingSheet} onOpenSearchSheet={reading.setIsSearchSheetOpen}
    onReadingTypographySettingsChange={() => {}}
    onSelectOutlineItem={reading.handleSelectOutlineItem} onToggleContentEditing={reading.enterContentEditing}
    openReadingSheet={reading.openReadingSheet} outlineOpen={reading.isOutlineOpen}
    readableArticle={{ content: 'alpha body and alpha again', nodeId: 'topic', title: 'Topic', hideTitleHeading: false,
      pdfAttachmentId: null, persistedNodeViewState: null, textAnchorDecorations: [] }}
    readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} searchOpen={reading.isSearchSheetOpen}
  />;
}

it('closes document search and secondary sheets before explicitly exiting reading', async () => {
  renderWithLocalization(<CompanionReadingSessionHost><ReadingRoute /></CompanionReadingSessionHost>);
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find in document' }));
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Find in document' });
  fireEvent.change(input, { target: { value: 'alpha' } });
  fireEvent.submit(input.form!);
  fireEvent.click(screen.getByRole('button', { name: 'Close document search' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByText('Search results')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find in document' }));
  expect(screen.getByRole('textbox', { name: 'Find in document' })).toHaveValue('');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find in document' }), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  expect(screen.getByRole('dialog', { name: 'Topic' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('Search results')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  expect(screen.getByText('Search results')).toBeInTheDocument();
});


it('keeps search available while reading between matches and lets the reader recover from no results', async () => {
  renderWithLocalization(<CompanionReadingSessionHost><ReadingRoute /></CompanionReadingSessionHost>);
  const opener = screen.getByRole('button', { name: 'More reading actions' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'Find in document' }));
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Find in document' });
  await waitFor(() => expect(input).toHaveFocus());
  const search = within(screen.getByRole('search', { name: 'Find in document' }));
  expect(search.queryByRole('status')).toBeNull();
  expect(search.queryByRole('button')).toBeNull();
  expect(input).toHaveAttribute('enterkeyhint', 'search');

  fireEvent.change(input, { target: { value: 'missing' } });
  expect(search.queryByRole('status')).toBeNull();
  fireEvent.submit(input.form!);
  expect(search.getByRole('status')).toHaveTextContent('0/0');
  expect(search.getByRole('button', { name: 'Next match' })).toBeDisabled();
  expect(search.getByRole('button', { name: 'Previous match' })).toBeDisabled();

  act(() => input.focus());
  expect(search.queryByRole('button')).toBeNull();
  fireEvent.change(input, { target: { value: 'alpha' } });
  fireEvent.submit(input.form!);
  expect(search.getByRole('status')).toHaveTextContent('1 / 2');
  fireEvent.click(search.getByRole('button', { name: 'Next match' }));
  expect(search.getByRole('status')).toHaveTextContent('2 / 2');
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(input).not.toHaveFocus();
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(search.getByRole('button', { name: 'Previous match' }));
  expect(search.getByRole('status')).toHaveTextContent('1 / 2');
  fireEvent.click(search.getByRole('button', { name: 'Close document search' }));
  expect(screen.queryByRole('search')).toBeNull();
});
