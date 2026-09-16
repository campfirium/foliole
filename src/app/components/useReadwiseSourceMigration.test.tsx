import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeReadwiseImportRunProgressEvent } from '../../../lib/platform/nativeImportContract';
import type { Translate } from '../../shared/localization/LocalizationProvider';

import { useReadwiseSourceMigration } from './useReadwiseSourceMigration';

const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const events = vi.hoisted(() => ({ handler: null as ((value: NativeReadwiseImportRunProgressEvent) => void) | null }));
const connection = vi.hoisted(() => ({ load: vi.fn() }));
const confirmation = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutover.preview,
  runReadwiseSourceCutoverInRuntime: cutover.run
}));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onReadwiseReaderImportProgress: vi.fn(async (handler) => {
    events.handler = handler;
    return () => undefined;
  })
}));
vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  loadReadwiseApiConnectionFromRuntime: connection.load
}));
vi.mock('../../shared/ui', () => ({ requestAppConfirmation: confirmation.request }));

beforeEach(() => {
  vi.clearAllMocks();
  events.handler = null;
  connection.load.mockResolvedValue({ has_credential: true, state: 'connected', verified_at: 'now' });
  confirmation.request.mockResolvedValue(true);
});

it('keeps the completed merging phase visible before removing migration status', async () => {
  let finish!: (value: { error_reason: null; migrated_count: number; status: 'completed'; unmatched_count: number }) => void;
  cutover.preview
    .mockResolvedValueOnce({
      completed_count: 3, error_reason: null, phase: 'merging', status: 'migration_in_progress',
      topic_count: 12, total_count: 4
    })
    .mockResolvedValueOnce({
      completed_count: 4, error_reason: null, phase: null, status: 'already_completed',
      topic_count: 12, total_count: 4
    });
  cutover.run.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

  render(<Probe />);
  fireEvent.click(screen.getByRole('button', { name: 'run-migration' }));
  await waitFor(() => expect(cutover.run).toHaveBeenCalled());
  act(() => events.handler?.({
    phase: 'merging', processedCount: 4, status: 'running', totalCount: 4
  }));
  expect(screen.getByTestId('phase')).toHaveTextContent('merging:4/4');

  act(() => finish({ error_reason: null, migrated_count: 4, status: 'completed', unmatched_count: 0 }));
  await new Promise((resolve) => window.setTimeout(resolve, 300));
  expect(screen.getByTestId('phase')).toHaveTextContent('merging:4/4');
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('none:4/none'), { timeout: 1500 });
});

it('keeps relay mode while a long migration is still running', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 12, total_count: null
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  const onCommitMode = vi.fn();

  render(<Probe committedMode="relay" onCommitMode={onCommitMode} />);
  fireEvent.click(screen.getByRole('button', { name: 'start-migration' }));

  await waitFor(() => expect(cutover.run).toHaveBeenCalled());
  expect(screen.getByTestId('phase')).toHaveTextContent('none:0/none');
  act(() => events.handler?.({
    phase: 'indexing', processedCount: 0, status: 'running', totalCount: 0
  }));
  expect(screen.getByTestId('phase')).toHaveTextContent('indexing:0/none');
  expect(onCommitMode).not.toHaveBeenCalled();
});

it('restores a durable migration without making the settings page execute it', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: 'indexing', status: 'migration_in_progress',
    topic_count: 12, total_count: null
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  const onCommitMode = vi.fn();
  const onSelectApi = vi.fn();

  render(<Probe committedMode="relay" onCommitMode={onCommitMode} onSelectApi={onSelectApi} />);

  await waitFor(() => expect(onSelectApi).toHaveBeenCalledOnce());
  expect(screen.getByTestId('phase')).toHaveTextContent('indexing:0/none');
  act(() => events.handler?.({
    phase: 'indexing', processedCount: 3, status: 'running', totalCount: 12
  }));
  expect(screen.getByTestId('phase')).toHaveTextContent('indexing:3/12');
  expect(onSelectApi).toHaveBeenCalledOnce();
  expect(cutover.run).not.toHaveBeenCalled();
  expect(onCommitMode).not.toHaveBeenCalled();
});

it('presents a required reconnection as a retryable migration failure', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 2, error_reason: null, phase: 'indexing', status: 'migration_in_progress',
    topic_count: 12, total_count: 12
  });
  cutover.run.mockResolvedValue({
    error_reason: 'readwise_api_reconnect_required', migrated_count: 2,
    status: 'connection_required', unmatched_count: 0
  });

  render(<Probe committedMode="relay" />);
  fireEvent.click(screen.getByRole('button', { name: 'run-migration' }));

  await waitFor(() => expect(screen.getByTestId('failure')).toHaveTextContent(
    'failed:readwise_api_reconnect_required'
  ));
});

it('restores completed migration warnings without reopening migration', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 27, error_reason: null,
    failed_items: [{
      reason: 'readwise_source_cutover_document_timeout', remote_id: 'document-1',
      stage: 'resources', title: 'Broken PDF'
    }],
    phase: null, status: 'already_completed', topic_count: 27, total_count: 27
  });
  const onSelectApi = vi.fn();

  render(<Probe committedMode="api" onSelectApi={onSelectApi} />);

  await waitFor(() => expect(screen.getByTestId('failures')).toHaveTextContent('1'));
  expect(onSelectApi).not.toHaveBeenCalled();
  expect(cutover.run).not.toHaveBeenCalled();
});

function Probe(props: {
  committedMode?: 'api' | 'relay';
  onCommitMode?: (mode: 'api' | 'relay' | 'off') => void;
  onSelectApi?: () => void;
} = {}) {
  const migration = useReadwiseSourceMigration({
    committedMode: props.committedMode ?? 'api',
    ...(props.onCommitMode ? { onCommitMode: props.onCommitMode } : {}),
    onSelectApi: props.onSelectApi ?? (() => undefined),
    t: ((key: string) => key) as Translate
  });
  return <>
    <div data-testid="phase">
      {migration.phase ?? 'none'}:{migration.completedCount}/{migration.totalCount ?? 'none'}
    </div>
    <div data-testid="failure">
      {migration.failed ? 'failed' : 'ready'}:{migration.errorReason ?? 'none'}
    </div>
    <div data-testid="failures">{migration.failures?.length ?? 0}</div>
    <button onClick={() => void migration.selectApi()} type="button">select-api</button>
    <button onClick={() => void migration.requestStart(() => undefined)} type="button">start-migration</button>
    <button onClick={() => void migration.start()} type="button">run-migration</button>
  </>;
}
