import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { ImmersiveChromeLayer } from './CompanionReadableArticleChromeLayer';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';
import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

function ReadingRoute() {
  const [open, setOpen] = useState(true);
  const reading = useImmersiveReadableArticleState();
  if (!open) return <p>Search results</p>;
  return <ImmersiveChromeLayer
    actionsOpen={reading.isActionsSheetOpen} editor={null} isChromeVisible
    isContentEditing={reading.isContentEditing} onExit={() => setOpen(false)}
    onFindInDocument={reading.openDocumentSearch}
    onOpenActions={reading.setIsActionsSheetOpen} onOpenOutline={reading.setIsOutlineOpen}
    onOpenReadingSheet={reading.setOpenReadingSheet} onOpenSearchSheet={reading.setIsSearchSheetOpen}
    onReadingTypographySettingsChange={() => {}}
    onSelectOutlineItem={reading.handleSelectOutlineItem} onToggleContentEditing={reading.enterContentEditing}
    openReadingSheet={reading.openReadingSheet} outlineOpen={reading.isOutlineOpen}
    readableArticle={{ content: 'alpha body', nodeId: 'topic', title: 'Topic', hideTitleHeading: false,
      persistedNodeViewState: null, textAnchorDecorations: [] }}
    readingTypographySettings={DEFAULT_READING_TYPOGRAPHY_SETTINGS} searchOpen={reading.isSearchSheetOpen}
  />;
}

it('closes document search and secondary sheets before explicitly exiting reading', async () => {
  renderWithLocalization(<ReadingRoute />);
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find in document' }));
  const input = screen.getByRole('textbox', { name: 'Find in document' });
  fireEvent.change(input, { target: { value: 'alpha' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close document search' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByText('Search results')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find in document' }));
  expect(screen.getByRole('textbox', { name: 'Find in document' })).toHaveValue('alpha');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Info' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Search results')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  expect(screen.getByText('Search results')).toBeInTheDocument();
});
