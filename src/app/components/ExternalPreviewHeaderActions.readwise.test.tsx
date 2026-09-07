import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';

import { ExternalPreviewHeaderActions } from './ExternalPreviewHeaderActions';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({ openExternalUrl: vi.fn() }));

beforeAll(() => preloadTranslationCatalog('en'));
beforeEach(() => vi.mocked(openExternalUrl).mockClear());

it('opens Reader and source URLs only for an explicit Readwise remote reference', () => {
  renderWithLocalization(
    <ExternalPreviewHeaderActions
      importedNodeId={null}
      isImporting={false}
      localFileEditing={{
        flushSave: vi.fn(async () => true), isEditable: false, reloadFromDisk: vi.fn(async () => undefined), status: 'saved'
      }}
      onHandleImport={vi.fn()}
      onOpenImportedNodeId={vi.fn()}
      reference={{
        documentId: 'readwise-doc', kind: 'readwise_remote',
        readerUrl: 'https://readwise.io/reader/read/01', sourceUrl: 'https://example.com/source'
      }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open source' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open in Reader' }));
  expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'https://example.com/source');
  expect(openExternalUrl).toHaveBeenNthCalledWith(2, 'https://readwise.io/reader/read/01');
});
