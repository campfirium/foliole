import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { createDefaultReadwiseAutoImportPolicy } from '../../../lib/core/import/readwiseAutoImportPolicy';
import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';

function renderPolicy(sourceMode: 'api' | 'folder') {
  const onChangePolicy = vi.fn();
  render(
    <LocalizationProvider>
      <SettingsReadwiseReaderContent
        config={{ ...createDefaultReadwiseReaderConfig(), enabled: true }}
        onChangePolicy={onChangePolicy}
        onSave={() => undefined}
        policy={createDefaultReadwiseAutoImportPolicy()}
        readwiseRootPath="/Readwise"
        readwiseSourceMode={sourceMode}
        readwiseSources={createReadwiseImportSources('/Readwise')}
      />
    </LocalizationProvider>
  );
  return onChangePolicy;
}

function expectSelection(groupName: string, optionName: string) {
  const group = screen.getByRole('radiogroup', { name: groupName });
  expect(within(group).getByRole('radio', { name: optionName }))
    .toHaveAttribute('aria-checked', 'true');
  expect(within(group).getAllByRole('radio')).toHaveLength(3);
}

it('keeps the folder policy on article and book rows backed by article and EPUB fields', () => {
  const onChangePolicy = renderPolicy('folder');
  expectSelection('Articles with highlights destination', 'Inbox');
  expectSelection('Articles without highlights destination', 'Off');
  expectSelection('Books with highlights destination', 'Inbox');
  expectSelection('Books without highlights destination', 'Inbox');

  const group = screen.getByRole('radiogroup', { name: 'Books without highlights destination' });
  fireEvent.click(within(group).getByRole('radio', { name: 'External document library' }));
  expect(onChangePolicy).toHaveBeenCalledWith('epubWithoutHighlights', 'external');
  expect(screen.queryByRole('textbox', { name: 'Reader document import tag' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Manual import' })).not.toBeInTheDocument();
});

it('shows fourteen exact defaults across the seven API parent categories', async () => {
  const onChangePolicy = renderPolicy('api');
  await waitFor(() => expect(screen.getByRole('radiogroup', {
    name: 'EPUBs without highlights destination'
  })).toBeInTheDocument());

  const selected = [
    ['Articles', 'Inbox', 'Off'], ['Emails', 'Inbox', 'Off'],
    ['RSS', 'Inbox', 'Off'], ['PDFs', 'Inbox', 'Inbox'],
    ['EPUBs', 'Inbox', 'Inbox'], ['Videos', 'Inbox', 'Off'],
    ['Tweets', 'Inbox', 'Off']
  ] as const;
  selected.forEach(([category, withHighlights, withoutHighlights]) => {
    expectSelection(`${category} with highlights destination`, withHighlights);
    expectSelection(`${category} without highlights destination`, withoutHighlights);
  });
  expect(screen.queryByRole('radiogroup', {
    name: 'Books without highlights destination'
  })).not.toBeInTheDocument();
  const input = screen.getByRole('textbox', { name: 'Reader document import tag' });
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'favorite' } });
  expect(onChangePolicy).toHaveBeenCalledWith('importTag', 'favorite');
  expect(screen.queryByRole('heading', { name: 'Manual import' })).not.toBeInTheDocument();
});
