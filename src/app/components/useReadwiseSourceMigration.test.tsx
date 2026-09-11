import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NativeReadwiseImportRunProgressEvent } from '../../../lib/platform/nativeImportContract';
import type { Translate } from '../../shared/localization/LocalizationProvider';

import { useReadwiseSourceMigration } from './useReadwiseSourceMigration';

const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const events = vi.hoisted(() => ({ handler: null as ((value: NativeReadwiseImportRunProgressEvent) => void) | null }));

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

function Probe() {
  const migration = useReadwiseSourceMigration({
    committedMode: 'api', onSelectApi: () => undefined, t: ((key: string) => key) as Translate
  });
  return <div data-testid="phase">
    {migration.phase ?? 'none'}:{migration.completedCount}/{migration.totalCount ?? 'none'}
  </div>;
}
