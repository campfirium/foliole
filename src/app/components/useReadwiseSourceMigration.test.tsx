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

it('commits API mode before waiting for a long migration run to finish', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: null, status: 'ready', topic_count: 12, total_count: null
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  const onCommitMode = vi.fn();

  render(<Probe committedMode="folder" onCommitMode={onCommitMode} />);
  fireEvent.click(screen.getByRole('button', { name: 'select-api' }));

  await waitFor(() => expect(cutover.run).toHaveBeenCalled());
  expect(onCommitMode).toHaveBeenCalledWith('api');
  const commitOrder = onCommitMode.mock.invocationCallOrder[0];
  const runOrder = cutover.run.mock.invocationCallOrder[0];
  if (commitOrder === undefined || runOrder === undefined) throw new Error('missing invocation order');
  expect(commitOrder).toBeLessThan(runOrder);
});

it('repairs a stale folder projection from the durable in-progress migration', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: 'indexing', status: 'migration_in_progress',
    topic_count: 12, total_count: null
  });
  cutover.run.mockReturnValue(new Promise(() => undefined));
  const onCommitMode = vi.fn();

  render(<Probe committedMode="folder" onCommitMode={onCommitMode} />);

  await waitFor(() => expect(onCommitMode).toHaveBeenCalledWith('api'));
  expect(cutover.run).toHaveBeenCalled();
});

function Probe(props: {
  committedMode?: 'api' | 'folder';
  onCommitMode?: (mode: 'api' | 'folder' | 'off') => void;
} = {}) {
  const migration = useReadwiseSourceMigration({
    committedMode: props.committedMode ?? 'api',
    ...(props.onCommitMode ? { onCommitMode: props.onCommitMode } : {}),
    onSelectApi: () => undefined,
    t: ((key: string) => key) as Translate
  });
  return <>
    <div data-testid="phase">
      {migration.phase ?? 'none'}:{migration.completedCount}/{migration.totalCount ?? 'none'}
    </div>
    <button onClick={() => void migration.selectApi()} type="button">select-api</button>
  </>;
}
