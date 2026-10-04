import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { SavedParentOrderHistory } from '../../../shared/platform/desktop/parentOrderHistory';

import { ParentOrderHistoryDialog } from './ParentOrderHistoryDialog';

const runtime = vi.hoisted(() => ({ invoke: vi.fn(), refresh: vi.fn(), available: true }));
vi.mock('../../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtime.available ? runtime.invoke : null,
  isRuntimeInvokeAvailable: () => runtime.available }));
vi.mock('../../../store/workspaceRefreshScheduler', () => ({ refreshWorkspaceState: runtime.refresh }));

beforeEach(() => {
  vi.resetAllMocks();
  runtime.available = true;
  runtime.refresh.mockResolvedValue(undefined);
});

it('previews a saved user arrangement and restores that snapshot through the bridge', async () => {
  const createdAt = '2026-10-04T00:00:00Z';
  runtime.invoke.mockResolvedValueOnce({ currentVersionId: 'current', nextAfter: null,
    versions: [{ parentId: 'folder', versionId: 'saved', kind: 'user',
      order: ['b', 'a'], parentVersionIds: [], createdAt }] })
    .mockResolvedValueOnce({ changed: true });
  const close = vi.fn();
  render(<ParentOrderHistoryDialog parentId="folder" nodesById={{}} onClose={close} />);
  const restore = screen.getByRole('button', { name: 'Restore arrangement' });
  expect(restore).toBeDisabled();
  fireEvent.click(await screen.findByRole('button', { name: new Date(createdAt).toLocaleString() }));
  expect(screen.getByRole('list', { name: 'Saved order' })).toBeVisible();
  fireEvent.click(restore);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(runtime.invoke).toHaveBeenLastCalledWith(NATIVE_COMMANDS.restoreParentOrderSnapshot,
    { parentId: 'folder', versionId: 'saved' });
  expect(runtime.refresh).toHaveBeenCalledWith('content-changed');
});

it('keeps the dialog open when the restore fails', async () => {
  const createdAt = '2026-10-04T00:00:00Z';
  runtime.invoke.mockResolvedValueOnce({ currentVersionId: null, nextAfter: null,
    versions: [{ parentId: 'folder', versionId: 'saved', kind: 'user',
      order: ['b', 'a'], parentVersionIds: [], createdAt }] })
    .mockRejectedValueOnce(new Error('missing snapshot'));
  const close = vi.fn();
  render(<ParentOrderHistoryDialog parentId="folder" nodesById={{}} onClose={close} />);
  fireEvent.click(await screen.findByRole('button', { name: new Date(createdAt).toLocaleString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore arrangement' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The arrangement could not be restored.');
  expect(close).not.toHaveBeenCalled();
  expect(runtime.refresh).not.toHaveBeenCalled();
});


it('reports an unavailable runtime instead of leaving the dialog loading', async () => {
  runtime.available = false;
  render(<ParentOrderHistoryDialog parentId="folder" nodesById={{}} onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Saved arrangements could not be loaded.');
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restore arrangement' })).toBeDisabled();
});

it('ignores the late loading reply from the previous parent', async () => {
  const oldDate = '2026-10-04T00:00:00Z';
  const newDate = '2026-10-05T00:00:00Z';
  let resolveOld: ((history: SavedParentOrderHistory) => void) | undefined;
  runtime.invoke.mockImplementationOnce(() => new Promise<SavedParentOrderHistory>((resolve) => {
    resolveOld = resolve;
  })).mockResolvedValueOnce({ currentVersionId: null, nextAfter: null,
    versions: [{ parentId: 'new-folder', versionId: 'new-saved', kind: 'user',
      order: ['c'], parentVersionIds: [], createdAt: newDate }] }).mockResolvedValueOnce({ changed: true });
  const close = vi.fn();
  const view = render(<ParentOrderHistoryDialog parentId="old-folder" nodesById={{}} onClose={close} />);
  view.rerender(<ParentOrderHistoryDialog parentId="new-folder" nodesById={{}} onClose={close} />);
  fireEvent.click(await screen.findByRole('button', { name: new Date(newDate).toLocaleString() }));
  await act(async () => resolveOld?.({ currentVersionId: null, nextAfter: null,
    versions: [{ parentId: 'old-folder', versionId: 'old-saved', kind: 'user',
      order: ['a'], parentVersionIds: [], createdAt: oldDate }] }));
  expect(screen.queryByRole('button', { name: new Date(oldDate).toLocaleString() })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore arrangement' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(runtime.invoke).toHaveBeenLastCalledWith(NATIVE_COMMANDS.restoreParentOrderSnapshot,
    { parentId: 'new-folder', versionId: 'new-saved' });
});

it('clears a selected arrangement immediately when the parent changes', async () => {
  const createdAt = '2026-10-04T00:00:00Z';
  runtime.invoke.mockResolvedValueOnce({ currentVersionId: null, nextAfter: null,
    versions: [{ parentId: 'folder', versionId: 'saved', kind: 'user',
      order: ['b'], parentVersionIds: [], createdAt }] })
    .mockImplementationOnce(() => new Promise(() => {}));
  const view = render(<ParentOrderHistoryDialog parentId="folder" nodesById={{}} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: new Date(createdAt).toLocaleString() }));
  expect(screen.getByRole('list', { name: 'Saved order' })).toBeVisible();
  view.rerender(<ParentOrderHistoryDialog parentId="other-folder" nodesById={{}} onClose={vi.fn()} />);
  expect(screen.queryByRole('list', { name: 'Saved order' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Restore arrangement' })).toBeDisabled();
});

it('reports a committed restore accurately when refreshing the view fails', async () => {
  const createdAt = '2026-10-04T00:00:00Z';
  runtime.invoke.mockResolvedValueOnce({ currentVersionId: null, nextAfter: null,
    versions: [{ parentId: 'folder', versionId: 'saved', kind: 'user',
      order: ['b'], parentVersionIds: [], createdAt }] }).mockResolvedValueOnce({ changed: true });
  runtime.refresh.mockRejectedValueOnce(new Error('refresh failed'));
  render(<ParentOrderHistoryDialog parentId="folder" nodesById={{}} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: new Date(createdAt).toLocaleString() }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore arrangement' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The arrangement was restored, but the view could not be refreshed.');
});
