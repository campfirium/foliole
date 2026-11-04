import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { FolderSyncLocation } from '../../lib/platform/nativeFolderSyncContract';

const host = vi.hoisted(() => ({ supported: true, read: vi.fn(), choose: vi.fn(), write: vi.fn(), setEnabled: vi.fn(),
  running: null as Promise<unknown> | null, listeners: new Set<() => void>() }));
vi.mock('../shared/platform/companion/folderSync/companionFolderSync', () => ({
  supportsCompanionFolderSync: () => host.supported,
  readCompanionFolderSyncState: host.read,
  companionFolderSync: { choose: host.choose, write: host.write, setEnabled: host.setEnabled,
    getActiveRun: () => host.running, subscribe: (listener: () => void) => { host.listeners.add(listener); return () => host.listeners.delete(listener); } }
}));

import { CompanionFolderSyncSection } from './CompanionFolderSyncSection';

let location: FolderSyncLocation | null;
let enabled: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  host.supported = true;
  host.running = null;
  host.listeners.clear();
  location = null;
  enabled = false;
  host.read.mockImplementation(async () => ({ location, enabled }));
  host.setEnabled.mockImplementation(async (next: boolean) => { enabled = next; });
  host.choose.mockImplementation(async () => {
    location = { token: 'selected', name: 'Documents', authorized: true, completion: null };
    return { location, cancelled: false };
  });
});

it('defaults off, selects only after enabling, and retains the enabled state and saved result on remount', async () => {
  host.write.mockImplementation(async () => { location = { ...location!, completion: { sourceId: 'library', generation: 1,
    checkedAt: '2026-11-04T00:00:00.000Z', pendingResources: 0 } }; });
  const view = render(<CompanionFolderSyncSection />);
  const toggle = screen.getByRole('switch', { name: 'Folder backup' });
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).not.toBeChecked();
  expect(host.choose).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  expect(await screen.findByText('Documents')).toBeInTheDocument();
  expect(toggle).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  expect(await screen.findByText(/Last saved:/u)).toBeInTheDocument();
  view.unmount();
  render(<CompanionFolderSyncSection />);
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Folder backup' })).toBeChecked());
  expect(screen.getByText(/Last saved:/u)).toBeInTheDocument();
  expect(host.choose).toHaveBeenCalledOnce();
});

it('stays disabled when the initial folder picker is cancelled', async () => {
  host.choose.mockResolvedValue({ location: null, cancelled: true });
  render(<CompanionFolderSyncSection />);
  const toggle = screen.getByRole('switch', { name: 'Folder backup' });
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  await waitFor(() => expect(host.choose).toHaveBeenCalledOnce());
  expect(host.setEnabled).not.toHaveBeenCalled();
  expect(toggle).not.toBeChecked();
});

it('refreshes automatic progress and its persisted result continuously without reopening settings', async () => {
  location = { token: 'selected', name: 'Documents', authorized: true, completion: null };
  enabled = true;
  render(<CompanionFolderSyncSection />);
  await screen.findByRole('button', { name: 'Save now' });
  await act(async () => { host.running = new Promise(() => {}); host.listeners.forEach(listener => listener()); });
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await act(async () => {
    host.running = null;
    location = { ...location!, completion: { sourceId: 'library', generation: 2, checkedAt: '2026-11-04T01:00:00.000Z', pendingResources: 1 } };
    host.listeners.forEach(listener => listener());
  });
  expect(await screen.findByText(/Last saved:/u)).toBeInTheDocument();
  expect(screen.getByText(/Some attachments have not been copied/u)).toBeInTheDocument();
  expect(host.write).not.toHaveBeenCalled();
});

it('keeps prior results visible and allows disabling while an automatic write is active', async () => {
  location = { token: 'selected', name: 'Documents', authorized: true,
    completion: { sourceId: 'library', generation: 1, checkedAt: '2026-11-04T00:00:00.000Z', pendingResources: 0 },
    failure: { sourceId: 'library', occurredAt: '2026-11-04T00:01:00.000Z' } };
  enabled = true;
  host.running = new Promise(() => {});
  render(<CompanionFolderSyncSection />);
  expect(await screen.findByText(/Could not access or save/u)).toBeInTheDocument();
  expect(screen.getByText(/Last saved:/u)).toBeInTheDocument();
  const toggle = screen.getByRole('switch', { name: 'Folder backup' });
  expect(toggle).toBeEnabled();
  fireEvent.click(toggle);
  await waitFor(() => expect(host.setEnabled).toHaveBeenCalledWith(false));
  await waitFor(() => expect(toggle).not.toBeChecked());
});

it('offers folder reselection after permission is lost', async () => {
  location = { token: 'selected', name: 'Documents', authorized: false, completion: null };
  enabled = true;
  render(<CompanionFolderSyncSection />);
  expect(await screen.findByText(/Folder access is no longer available/u)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Change folder' })).toBeEnabled();
});

it('does not let an older automatic-state read turn the switch back on after disabling', async () => {
  location = { token: 'selected', name: 'Documents', authorized: true, completion: null };
  enabled = true;
  render(<CompanionFolderSyncSection />);
  const toggle = screen.getByRole('switch', { name: 'Folder backup' });
  await waitFor(() => expect(toggle).toBeChecked());
  let finish!: () => void;
  host.read.mockImplementationOnce(() => new Promise(resolve => {
    finish = () => resolve({ location, enabled: true });
  }));
  await act(async () => { host.listeners.forEach(listener => listener()); });
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  await act(async () => { finish(); });
  expect(toggle).not.toBeChecked();
});

it('retries an initial state read without writing or choosing a folder', async () => {
  host.read.mockRejectedValueOnce(new Error('unavailable'));
  render(<CompanionFolderSyncSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Folder backup' })).toBeEnabled());
  expect(host.write).not.toHaveBeenCalled();
  expect(host.choose).not.toHaveBeenCalled();
});

it('hides the capability on hosts without a native directory adapter', () => {
  host.supported = false;
  const view = render(<CompanionFolderSyncSection />);
  expect(view.container).toBeEmptyDOMElement();
  expect(host.read).not.toHaveBeenCalled();
});
