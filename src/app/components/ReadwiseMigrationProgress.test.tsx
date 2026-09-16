import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseMigrationProgress } from './ReadwiseMigrationProgress';

const INITIAL_IMPORT_STATUS = {
  cutover: {
    completed_count: 27, failed_count: 0, pending_count: 0,
    status: 'in_progress' as const, total_count: 27, unexplained_failure_count: 0
  },
  eligibility: 'ready' as const,
  initial_sync: {
    completed_count: 1327, failed_count: 0,
    lifecycle: {
      error_reason: null, finished_at: null, kind: 'initial' as const,
      progress: {
        completed_count: 1327, failed_count: 0, pending_count: 0,
        total_count: null, unexplained_failure_count: 0
      },
      queued_at: '2026-09-16T00:00:00.000Z', run_id: 'initial-run',
      stage: 'fetching' as const, started_at: '2026-09-16T00:00:01.000Z',
      status: 'running' as const, trigger: 'startup' as const
    },
    pending_count: 0, status: 'running' as const, total_count: null,
    unexplained_failure_count: 0
  },
  routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
};

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

  expect(screen.getByText('Readwise migration · Downloading · 5%')).toBeInTheDocument();
});

it('shows cumulative first-sync progress while the API index is being fetched', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        migration={{
          completedCount: 27, errorReason: null, failed: false,
          phase: null, totalCount: null
        }}
        taskStatus={INITIAL_IMPORT_STATUS}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Readwise migration · Indexing · 1327')).toBeInTheDocument();
});

it('shows completed and total counts while first-sync topics are imported', () => {
  const taskStatus = {
    ...INITIAL_IMPORT_STATUS,
    initial_sync: {
      ...INITIAL_IMPORT_STATUS.initial_sync,
      lifecycle: {
        ...INITIAL_IMPORT_STATUS.initial_sync.lifecycle,
        progress: {
          completed_count: 13, failed_count: 0, pending_count: 14,
          total_count: 27, unexplained_failure_count: 0
        },
        stage: 'writing' as const
      }
    }
  };
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        migration={{
          completedCount: 27, errorReason: null, failed: false,
          phase: null, totalCount: null
        }}
        taskStatus={taskStatus}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Readwise migration · Downloading · 13 / 27')).toBeInTheDocument();
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

  const status = screen.getByText('Readwise migration · Downloading');
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

  expect(screen.getByText('Readwise migration · Download failed')).toBeInTheDocument();
  expect(screen.queryByText(/request_failed/)).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps completed migration failures summarized in the source selector', () => {
  render(
    <LocalizationProvider>
      <ReadwiseMigrationProgress
        migration={{
          completedCount: 27,
          errorReason: null,
          failed: false,
          failures: [{
            reason: 'readwise_source_cutover_document_timeout',
            remote_id: 'document-1',
            stage: 'resources',
            title: 'Broken PDF'
          }],
          phase: null,
          totalCount: 27
        }}
        taskStatus={null}
      />
    </LocalizationProvider>
  );

  expect(screen.getByText('Migration completed · Incomplete sources: 1'))
    .toBeInTheDocument();
  expect(screen.queryByText('Broken PDF')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry migration' })).not.toBeInTheDocument();
});

it('shows the downloaded record count while a reliable percentage is unavailable', () => {
  render(<LocalizationProvider><ReadwiseMigrationProgress
    migration={{ completedCount: 900, errorReason: null, failed: false, phase: 'indexing', totalCount: null }}
    taskStatus={null}
  /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent(/^Readwise migration · Downloading · 900$/);
});

it('shows zero before the first download page arrives', () => {
  render(<LocalizationProvider><ReadwiseMigrationProgress
    migration={{ completedCount: 0, errorReason: null, failed: false, phase: 'indexing', totalCount: null }}
    taskStatus={null}
  /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent(/^Readwise migration · Downloading · 0$/);
});

it('keeps failed updates in the same denominator and distinguishes internal verification errors', () => {
  render(<LocalizationProvider><ReadwiseMigrationProgress
    migration={{ completedCount: 27, errorReason: 'readwise_source_cutover_epub_projection_incomplete',
      failed: true, phase: 'merging', totalCount: 27 }}
    taskStatus={null}
  /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('27 / 27');
  expect(screen.getByRole('status')).toHaveTextContent('Migration verification failed');
  expect(screen.getByRole('status')).not.toHaveTextContent('Readwise request failed');
});

it('reports a real HTTP failure separately from internal verification errors', () => {
  render(<LocalizationProvider><ReadwiseMigrationProgress
    migration={{ completedCount: 0, errorReason: 'readwise_api_http_400', failed: true, phase: 'indexing', totalCount: null }}
    taskStatus={null}
  /></LocalizationProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('Readwise returned HTTP 400');
});
