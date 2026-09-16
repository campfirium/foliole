import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseMigrationProgress } from './ReadwiseMigrationProgress';

it('shows remote records while importing migration facts', () => {
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

  expect(screen.getByText('Migrating · Importing · 12 / 234')).toBeInTheDocument();
});

it('provides a compact visual-only phase without repeating progress details', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        compact
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

  const status = screen.getByText('Migrating · Importing');
  expect(status).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByText(/12 \/ 234/)).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps compact failure status concise and omits the detailed reason', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        compact
        migration={{
          completedCount: 12,
          errorReason: 'request_failed',
          failed: true,
          phase: 'indexing',
          totalCount: 234
        }}
        taskStatus={null}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Migrating · Import failed')).toBeInTheDocument();
  expect(screen.queryByText(/request_failed/)).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
