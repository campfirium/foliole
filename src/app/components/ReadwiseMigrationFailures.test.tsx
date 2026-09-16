import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseMigrationFailures } from './ReadwiseMigrationFailures';

it('shows each failed source with a readable reason and diagnostic code', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationFailures failures={[
        {
          reason: 'original_file_download_failed', remote_id: 'book-1',
          stage: 'resources', title: 'Broken EPUB'
        },
        {
          reason: 'readwise_source_cutover_annotation_binding_missing', remote_id: 'article-1',
          stage: 'recording', title: 'Broken article'
        }
      ]} />
    </LocalizationProvider>
  );

  expect(screen.getByRole('region', { name: 'Migration issues' })).toHaveTextContent(
    'Broken EPUBgetting its file or images · The original file could not be downloaded · Diagnostic code: original_file_download_failed'
  );
  expect(screen.getByText('Broken article').parentElement).toHaveTextContent(
    'saving the migration result · The highlights could not be linked to the Topic'
  );
});

it('does not expose an absolute path from a file access error', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationFailures failures={[{
        reason: "EPERM: operation not permitted, open '/Users/example/Documents/Foliole/Assets/book.epub'",
        remote_id: 'book-1', stage: 'resources', title: 'Private EPUB'
      }]} />
    </LocalizationProvider>
  );

  expect(screen.getByText('Private EPUB').parentElement).toHaveTextContent(
    'Foliole could not read the downloaded original file · Diagnostic code: file_access_denied'
  );
  expect(screen.queryByText(/\/Users\/example/)).not.toBeInTheDocument();
});
