import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';

const fixture = vi.hoisted(() => {
  const state: CompanionFolderBackupState = { configured: true, directoryLabel: 'Documents/Backup', databaseSavedAt: null,
    phase: 'idle', errorMessage: null };
  const listeners = new Set<(event: { state: unknown }) => void>();
  return { state, listeners, automaticListeners: new Set<(enabled: boolean) => void>(), automatic: false, forget: vi.fn(), setAutomatic: vi.fn(), request: vi.fn(), port: {
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
  await screen.findByText('Attachments waiting: 2');
  expect(screen.getByText('Only attachments available on this device are included.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Directory permission unavailable.');
  expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled();
  view.unmount();
});
vi.mock('../shared/platform/companion/folderBackup/companionAutomaticFolderBackup', () => ({
  getCompanionAutomaticFolderBackup: async () => fixture.automatic,
  setCompanionAutomaticFolderBackup: fixture.setAutomatic,
  clearCompanionFolderBackupDirectory: fixture.forget,
  subscribeCompanionAutomaticFolderBackup: (listener: (enabled: boolean) => void) => {
    fixture.automaticListeners.add(listener); return () => { fixture.automaticListeners.delete(listener); };
  }
}));
vi.mock('../shared/platform/companion/folderBackup/companionFolderBackupState', () => ({
  getCompanionFolderBackupState: async (state?: CompanionFolderBackupState) => state ?? fixture.port.getState(),
  subscribeCompanionFolderBackupWork: () => () => undefined
}));
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

it('keeps automatic backup separate from folder authorization and lets it be disabled during a backup', async () => {
  fixture.automatic = false;
  const view = render(<CompanionFolderDatabaseBackupSection />);
  const toggle = await screen.findByRole('switch', { name: 'Automatic backup' });
  await waitFor(() => expect(toggle).toBeEnabled()); expect(toggle).not.toBeChecked();
  expect(fixture.setAutomatic).not.toHaveBeenCalled();
  fireEvent.click(toggle); await waitFor(() => expect(fixture.setAutomatic).toHaveBeenCalledWith(true));
  await waitFor(() => expect(toggle).toBeChecked());
  act(() => { for (const listener of fixture.listeners) listener({ state: { ...fixture.state, phase: 'working' } }); });
  expect(toggle).toBeEnabled(); fireEvent.click(toggle);
  await waitFor(() => expect(fixture.setAutomatic).toHaveBeenLastCalledWith(false));
  await waitFor(() => expect(toggle).not.toBeChecked()); view.unmount();
});

it('lets the user stop using the folder without requesting another backup', async () => {
  fixture.forget.mockResolvedValue({ configured: false, directoryLabel: null, databaseSavedAt: null, phase: 'idle', errorMessage: null });
  const view = render(<CompanionFolderDatabaseBackupSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Stop using folder' }));
  await waitFor(() => expect(fixture.forget).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop using folder' })).not.toBeInTheDocument());
  expect(fixture.request).not.toHaveBeenCalled(); expect(screen.getByRole('switch')).not.toBeChecked(); view.unmount();
});

it('updates the automatic switch when the persisted setting changes outside this control', async () => {
  fixture.automatic = false;
  const view = render(<CompanionFolderDatabaseBackupSection />);
  const toggle = await screen.findByRole('switch', { name: 'Automatic backup' });
  await waitFor(() => expect(toggle).toBeEnabled()); expect(toggle).not.toBeChecked();
  act(() => { for (const listener of fixture.automaticListeners) listener(true); });
  expect(toggle).toBeChecked(); view.unmount();
});
