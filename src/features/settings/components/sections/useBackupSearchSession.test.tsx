import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  cancel: vi.fn(),
  next: vi.fn(),
  start: vi.fn()
}));

vi.mock('../../../../shared/platform/backupSearch/databaseBackupSearchRuntimeRepository', () => ({
  cancelDatabaseBackupSearch: runtime.cancel,
  nextDatabaseBackupSearch: runtime.next,
  startDatabaseBackupSearch: runtime.start
}));

import { useBackupSearchSession } from './useBackupSearchSession';

const match = (nodeId: string) => ({
  backup_name: `manual-${nodeId}.db.gz`,
  backup_updated_at: '2026-09-10T00:00:00.000Z',
  content: `# ${nodeId}`,
  deleted: false,
  node_id: nodeId,
  path: `Archive / ${nodeId}`,
  title: nodeId
});

beforeEach(() => {
  vi.clearAllMocks();
  runtime.cancel.mockResolvedValue(undefined);
  runtime.start.mockResolvedValue('session-1');
  runtime.next.mockResolvedValue({ match: match('first'), skipped_backup_count: 0, status: 'match' });
});

it('accumulates fetched results and selects viewed content in memory', async () => {
  const { result } = renderHook(() => useBackupSearchSession(true));
  act(() => result.current.setQuery('needle'));
  expect(runtime.start).not.toHaveBeenCalled();

  await act(() => result.current.submit());
  expect(runtime.start).toHaveBeenCalledWith('needle');
  expect(result.current.current?.node_id).toBe('first');

  runtime.next.mockResolvedValueOnce({ match: match('second'), skipped_backup_count: 1, status: 'match' });
  await act(() => result.current.continueSearch());
  expect(result.current.current?.node_id).toBe('second');
  expect(result.current.skippedBackupCount).toBe(1);
  act(() => result.current.select(0));
  expect(result.current.current?.node_id).toBe('first');
  expect(runtime.next).toHaveBeenCalledTimes(2);

  runtime.next.mockResolvedValueOnce({ skipped_backup_count: 1, status: 'complete' });
  await act(() => result.current.continueSearch());
  expect(result.current.status).toBe('complete');
  expect(result.current.history).toHaveLength(2);
});

it('cancels an old query before replacement and ignores its late first result', async () => {
  let resolveOld: (value: unknown) => void = () => undefined;
  runtime.next.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  runtime.start.mockResolvedValueOnce('old-session').mockResolvedValueOnce('new-session');
  const { result } = renderHook(() => useBackupSearchSession(true));
  act(() => result.current.setQuery('old'));
  let oldSubmit: Promise<void> | undefined;
  act(() => { oldSubmit = result.current.submit(); });
  await waitFor(() => expect(runtime.next).toHaveBeenCalledWith('old-session'));

  act(() => result.current.setQuery('new'));
  runtime.next.mockResolvedValueOnce({ match: match('new-result'), skipped_backup_count: 0, status: 'match' });
  await act(() => result.current.submit());
  expect(runtime.cancel).toHaveBeenCalledWith('old-session');
  expect(result.current.current?.node_id).toBe('new-result');

  await act(async () => {
    resolveOld({ match: match('old-result'), skipped_backup_count: 0, status: 'match' });
    await oldSubmit;
  });
  expect(result.current.history).toHaveLength(1);
  expect(result.current.current?.node_id).toBe('new-result');
});

it('cancels and clears the in-memory session when the panel closes', async () => {
  let open = true;
  const { result, rerender } = renderHook(() => useBackupSearchSession(open));
  act(() => result.current.setQuery('needle'));
  await act(() => result.current.submit());
  open = false;
  rerender();

  await waitFor(() => expect(runtime.cancel).toHaveBeenCalledWith('session-1'));
  expect(result.current.current).toBeNull();
  expect(result.current.query).toBe('');
  expect(result.current.status).toBe('idle');
});

it('cancels before the first result and ignores that result when it arrives late', async () => {
  let resolveNext: (value: unknown) => void = () => undefined;
  runtime.next.mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
  let open = true;
  const { result, rerender } = renderHook(() => useBackupSearchSession(open));
  act(() => result.current.setQuery('needle'));
  let submit: Promise<void> | undefined;
  act(() => { submit = result.current.submit(); });
  await waitFor(() => expect(runtime.next).toHaveBeenCalledWith('session-1'));

  open = false;
  rerender();
  await waitFor(() => expect(runtime.cancel).toHaveBeenCalledWith('session-1'));
  await act(async () => {
    resolveNext({ match: match('late'), skipped_backup_count: 0, status: 'match' });
    await submit;
  });
  expect(result.current.current).toBeNull();
  expect(result.current.status).toBe('idle');
});
