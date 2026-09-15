import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useReadwiseMigrationRecovery } from './useReadwiseMigrationRecovery';

const cutover = vi.hoisted(() => ({ preview: vi.fn(), run: vi.fn() }));
const settings = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));

vi.mock('../../shared/platform/import/readwiseSourceCutoverRuntimeRepository', () => ({
  previewReadwiseSourceCutoverInRuntime: cutover.preview,
  runReadwiseSourceCutoverInRuntime: cutover.run
}));
vi.mock('../components/importSourceWorkspaceSettings', () => ({
  loadImportSourceWorkspaceSettings: settings.load,
  saveImportSourceWorkspaceSettings: settings.save
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: null, phase: null, status: 'ready',
    topic_count: 0, total_count: null
  });
  cutover.run.mockResolvedValue({
    error_reason: null, migrated_count: 0, status: 'completed', unmatched_count: 0
  });
  settings.load.mockResolvedValue({ readwiseSourceMode: 'relay' });
  settings.save.mockResolvedValue({ readwiseSourceMode: 'api' });
  setOnline(true);
});

afterEach(() => vi.useRealTimers());

it('checks once after app readiness and resumes one pending migration', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: 'request_failed', phase: 'indexing',
    status: 'migration_in_progress', topic_count: 1, total_count: null
  });
  const { rerender } = renderHook(({ ready }) => useReadwiseMigrationRecovery(ready), {
    initialProps: { ready: false }
  });

  await act(async () => rerender({ ready: true }));
  await act(async () => vi.runAllTimersAsync());

  expect(cutover.preview).toHaveBeenCalledOnce();
  expect(cutover.run).toHaveBeenCalledOnce();
  expect(settings.save).toHaveBeenCalledWith(expect.objectContaining({ readwiseSourceMode: 'api' }));
});

it('commits API mode when migration finished before the prior app exited', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 1, error_reason: null, phase: null,
    status: 'already_completed', topic_count: 1, total_count: 1
  });
  renderHook(() => useReadwiseMigrationRecovery(true));
  await act(async () => vi.runAllTimersAsync());

  expect(cutover.run).not.toHaveBeenCalled();
  expect(settings.save).toHaveBeenCalledWith(expect.objectContaining({ readwiseSourceMode: 'api' }));
});

it('waits offline, resumes on the next online event, and removes the listener', async () => {
  setOnline(false);
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: 'request_failed', phase: 'indexing',
    status: 'migration_in_progress', topic_count: 1, total_count: null
  });
  renderHook(() => useReadwiseMigrationRecovery(true));
  await act(async () => vi.runAllTimersAsync());
  expect(cutover.run).not.toHaveBeenCalled();

  setOnline(true);
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();
  });
  expect(cutover.run).toHaveBeenCalledOnce();
  act(() => window.dispatchEvent(new Event('online')));
  expect(cutover.run).toHaveBeenCalledOnce();
});

it('waits for the next online event after request retries are exhausted', async () => {
  cutover.preview.mockResolvedValue({
    completed_count: 0, error_reason: 'request_failed', phase: 'indexing',
    status: 'migration_in_progress', topic_count: 1, total_count: null
  });
  cutover.run
    .mockResolvedValueOnce({
      error_reason: 'request_failed', migrated_count: 0,
      status: 'failed', unmatched_count: 0
    })
    .mockResolvedValueOnce({
      error_reason: null, migrated_count: 1,
      status: 'completed', unmatched_count: 0
    });
  renderHook(() => useReadwiseMigrationRecovery(true));
  await act(async () => vi.runAllTimersAsync());
  expect(cutover.run).toHaveBeenCalledOnce();

  setOnline(false);
  setOnline(true);
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await vi.runAllTimersAsync();
  });
  expect(cutover.run).toHaveBeenCalledTimes(2);
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}
