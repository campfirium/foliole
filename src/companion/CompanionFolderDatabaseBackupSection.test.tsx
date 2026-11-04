import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';

const fixture = vi.hoisted(() => {
  const state: CompanionFolderBackupState = { configured: true, directoryLabel: 'Documents/Backup', databaseSavedAt: null,
    phase: 'idle', errorMessage: null };
  const listeners = new Set<(event: { state: unknown }) => void>();
  return { state, listeners, request: vi.fn(), port: {
    getState: vi.fn(async () => ({ ...state })),
    addListener: vi.fn(async (_: string, listener: (event: { state: unknown }) => void) => {
      listeners.add(listener);
      return { remove: async () => { listeners.delete(listener); } };
    })
  } };
});

beforeEach(() => {
  Object.assign(fixture.state, { configured: true, directoryLabel: 'Documents/Backup', databaseSavedAt: null,
    phase: 'idle', errorMessage: null, attachmentFilesPending: undefined });
  vi.clearAllMocks();
});

it('shows the last unfinished attachment result without presenting it as a complete backup', async () => {
  Object.assign(fixture.state, { phase: 'pending', databaseSavedAt: '2026-11-04T07:55:00Z',
    attachmentFilesPending: 2, errorMessage: 'Directory permission unavailable.' });
  const view = render(<CompanionFolderDatabaseBackupSection />);
  await screen.findByText('Attachments remaining after the last backup: 2');
  expect(screen.getByText('Some attachments may be missing from this backup.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Directory permission unavailable.');
  expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled();
  view.unmount();
});
vi.mock('../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository', () => ({
  supportsCompanionFolderDatabaseBackup: () => true, getCompanionFolderBackupPort: () => fixture.port
}));
vi.mock('../shared/platform/companion/folderBackup/companionFolderBackup', () => ({ backUpCompanionDatabase: fixture.request }));

import { CompanionFolderDatabaseBackupSection } from './CompanionFolderDatabaseBackupSection';

it('retains working state across leaving and returning, then receives the actual completion without reopening settings', async () => {
  fixture.request.mockImplementation(() => {
    fixture.state.phase = 'working';
    return new Promise(() => undefined);
  });
  const first = render(<CompanionFolderDatabaseBackupSection />);
  await screen.findByText('Documents/Backup');
  fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
  await waitFor(() => expect(fixture.request).toHaveBeenCalled());
  first.unmount();
  const second = render(<CompanionFolderDatabaseBackupSection />);
  await screen.findByText('Documents/Backup');
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  const completed: CompanionFolderBackupState = { ...fixture.state, phase: 'saved', databaseSavedAt: '2026-11-04T07:55:00Z' };
  act(() => { for (const listener of fixture.listeners) listener({ state: completed }); });
  expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent(new Date(completed.databaseSavedAt!).toLocaleString());
  second.unmount();
  await waitFor(() => expect(fixture.listeners.size).toBe(0));
});
