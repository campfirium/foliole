import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseMigrationProgress } from './ReadwiseMigrationProgress';

it('shows the frozen parent total while indexing resources', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        migration={{
          completedCount: 12,
          errorReason: null,
          failed: false,
          phase: 'indexing',
          totalCount: 234
        }}
        taskStatus={null}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Migrating · Indexing · 12 / 234')).toBeInTheDocument();
});
