import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  revert: vi.fn(),
  previous: vi.fn(),
  deletePrevious: vi.fn(),
}));

vi.mock('../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository', () => ({
  supportsCompanionBackupRestore: () => true, getCompanionBackupRestorePort: () => ({ previous: fixture.previous, deletePrevious: fixture.deletePrevious })
}));
vi.mock('../shared/platform/companion/backupRestore/companionBackupRestore', () => ({
  revertCompanionBackupRestore: fixture.revert
}));
vi.mock('./useCompanionBackupRestore', () => ({
  companionLibrarySwapContext: () => ({ swap: 'context' }), reloadCompanionApp: vi.fn()
}));

import { CompanionBackupRevertRow } from './CompanionBackupRevertRow';

beforeEach(() => { vi.clearAllMocks(); });

it('offers nothing while no library was set aside on this phone', async () => {
  fixture.previous.mockResolvedValueOnce({ exists: false, savedAt: null });
  const view = render(<CompanionBackupRevertRow />);
  await Promise.resolve();
  expect(screen.queryByTestId('companion-revert-open')).not.toBeInTheDocument();
  view.unmount();
});

it('puts back the set-aside library only after confirmation', async () => {
  fixture.previous.mockResolvedValueOnce({ exists: true, savedAt: '2026-11-21T08:30:00Z' });
  fixture.revert.mockReturnValueOnce(new Promise(() => undefined));
  render(<CompanionBackupRevertRow />);
  fireEvent.click(await screen.findByTestId('companion-revert-open'));
  expect(screen.getByText(/set aside, not deleted/)).toBeInTheDocument();
  expect(fixture.revert).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTestId('companion-revert-confirm'));
  expect(await screen.findByText('Putting back library…')).toBeInTheDocument();
  expect(fixture.revert).toHaveBeenCalledWith({ swap: 'context' });
});

it('explains a failed revert and offers to reopen Foliole', async () => {
  fixture.previous.mockResolvedValueOnce({ exists: true, savedAt: '2026-11-21T08:30:00Z' });
  fixture.revert.mockRejectedValueOnce(new Error('restore_sync_group_active'));
  render(<CompanionBackupRevertRow />);
  fireEvent.click(await screen.findByTestId('companion-revert-open'));
  fireEvent.click(screen.getByTestId('companion-revert-confirm'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Leave the sync group before restoring.');
  expect(screen.getByRole('button', { name: 'Reopen Foliole' })).toBeInTheDocument();
});

it('deletes the set-aside library only after confirming its size, then stops offering it', async () => {
  fixture.previous.mockResolvedValueOnce({ exists: true, savedAt: '2026-11-21T08:30:00Z', bytes: 5 * 1024 * 1024 });
  fixture.deletePrevious.mockResolvedValueOnce(undefined);
  render(<CompanionBackupRevertRow />);
  fireEvent.click(await screen.findByTestId('companion-revert-delete'));
  expect(screen.getByText(/frees about 5 MB and cannot be undone/)).toBeInTheDocument();
  expect(fixture.deletePrevious).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('companion-revert-delete-confirm'));
  await waitFor(() => expect(screen.queryByTestId('companion-revert-open')).not.toBeInTheDocument());
  expect(fixture.deletePrevious).toHaveBeenCalledTimes(1);
  expect(fixture.revert).not.toHaveBeenCalled();
});
