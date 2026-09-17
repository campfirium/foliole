import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';

import { ReadwiseSourceModeSection } from './ReadwiseSourceModeSection';
import { createReadwiseApiModeTestSettings } from './ReadwiseSourceModeSection.testSupport';

const runtime = vi.hoisted(() => ({ load: vi.fn() }));
const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const schedule = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseApiConnectionRuntimeRepository', () => ({
  loadReadwiseApiConnectionFromRuntime: runtime.load
}));
vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutover.preview,
  runReadwiseSourceCutoverInRuntime: cutover.run
}));
vi.mock('../../shared/platform/readwiseReaderImportRuntimeRepository', () => ({
  loadReadwiseApiScheduleStatusInRuntime: schedule.load
}));

beforeEach(() => {
  vi.clearAllMocks();
  runtime.load.mockResolvedValue({ has_credential: true, state: 'connected', verified_at: 'now' });
  cutover.preview.mockResolvedValue({
    completed_count: 31, error_reason: null, phase: null, status: 'already_completed',
    topic_count: 31, total_count: 31
  });
  schedule.load.mockResolvedValue({
    cutover: {
      completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed',
      total_count: 31, unexplained_failure_count: 0
    },
    eligibility: 'ready',
    initial_sync: {
      completed_count: 0, failed_count: 0, lifecycle: null, pending_count: 0,
      status: 'pending', total_count: null, unexplained_failure_count: 0
    },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
});

it('keeps the normal sync action available after API activation', async () => {
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted
    apiSettings={createReadwiseApiModeTestSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('button', { name: 'Sync now' })).toBeEnabled();
  expect(screen.queryByText('API enabled')).not.toBeInTheDocument();
  expect(screen.queryByText('First sync pending')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('does not repeat the selected API mode after the initial sync completes', async () => {
  schedule.load.mockResolvedValue({
    cutover: {
      completed_count: 31, failed_count: 0, pending_count: 0, status: 'completed',
      total_count: 31, unexplained_failure_count: 0
    },
    eligibility: 'ready',
    initial_sync: {
      completed_count: 31, failed_count: 0, lifecycle: null, pending_count: 0,
      status: 'completed', total_count: 31, unexplained_failure_count: 0
    },
    routine_sync: { last_result: null, lifecycle: null, next_run_at: null }
  });
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted
    apiSettings={createReadwiseApiModeTestSettings()}
    committedMode="api"
    mode="api"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('button', { name: 'Sync now' })).toBeInTheDocument();
  expect(screen.queryByText('API enabled')).not.toBeInTheDocument();
  expect(screen.queryByText('First sync pending')).not.toBeInTheDocument();
});

it('turns a completed API source off and enables it again without migration', () => {
  const onChange = vi.fn();
  const onCommitMode = vi.fn();
  const view = render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted committedMode="api" mode="api"
    onChange={onChange} onCommitMode={onCommitMode}
  /></LocalizationProvider>);

  fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
  expect(onChange).toHaveBeenCalledWith('off');
  expect(onCommitMode).toHaveBeenCalledWith('off');

  view.rerender(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted committedMode="off" mode="off"
    onChange={onChange} onCommitMode={onCommitMode}
  /></LocalizationProvider>);
  expect(screen.getByRole('radio', { name: 'Obsidian relay' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  expect(onChange).toHaveBeenCalledWith('api');
  expect(onCommitMode).toHaveBeenCalledWith('api');
  expect(cutover.run).not.toHaveBeenCalled();
});

it('lets a completed library resolve a relay conflict through the source selector', async () => {
  const onChange = vi.fn();
  const onCommitMode = vi.fn();
  render(<LocalizationProvider><ReadwiseSourceModeSection
    apiMigrationCompleted
    committedMode="relay"
    conflictReasons={['completion_conflicts_with_mode']}
    mode="relay"
    onChange={onChange}
    onCommitMode={onCommitMode}
  /></LocalizationProvider>);

  expect(await screen.findByText(
    'Readwise settings do not match this library. Choose Off or API mode to continue.'
  ))
    .toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Obsidian relay' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'API mode' }));
  expect(onChange).toHaveBeenCalledWith('api');
  expect(onCommitMode).toHaveBeenCalledWith('api');
  expect(cutover.run).not.toHaveBeenCalled();
});

it('keeps unresolved library conflicts disabled', async () => {
  render(<LocalizationProvider><ReadwiseSourceModeSection
    committedMode="relay"
    conflictReasons={['legacy_mode_conflict']}
    mode="relay"
    onChange={() => undefined}
  /></LocalizationProvider>);

  expect(await screen.findByRole('status')).toBeInTheDocument();
  expect(screen.getAllByRole('radio').every((radio) => radio.hasAttribute('disabled'))).toBe(true);
});
