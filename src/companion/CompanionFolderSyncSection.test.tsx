import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { FolderSyncLocation } from '../../lib/platform/nativeFolderSyncContract';

const host = vi.hoisted(() => ({ supported: true, read: vi.fn(), choose: vi.fn(), write: vi.fn() }));
vi.mock('../shared/platform/companion/folderSync/companionFolderSync', () => ({
  supportsCompanionFolderSync: () => host.supported,
  readCompanionFolderSyncState: host.read,
  companionFolderSync: { choose: host.choose, write: host.write }
}));

import { CompanionFolderSyncSection } from './CompanionFolderSyncSection';

let location: FolderSyncLocation | null;
beforeEach(() => {
  vi.clearAllMocks();
  host.supported = true;
  location = null;
  host.read.mockImplementation(async () => ({ location, deviceSyncConfigured: false }));
  host.choose.mockImplementation(async () => {
    location = { token: 'selected', name: 'Documents', authorized: true, completion: null };
  });
});

it('lets the user choose once, save, and see the persisted result after remounting', async () => {
  let complete!: () => void;
  host.write.mockImplementation(() => new Promise<void>(resolve => { complete = () => {
    location = { ...location!, completion: { sourceId: 'library', generation: 1,
      checkedAt: '2026-11-04T00:00:00.000Z', pendingResources: 0 } };
    resolve();
  }; }));
  const view = render(<CompanionFolderSyncSection />);
  const choose = await screen.findByRole('button', { name: 'Choose folder' });
  await waitFor(() => expect(choose).toBeEnabled());
  fireEvent.click(choose);
  expect(await screen.findByText('Documents')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  await waitFor(() => expect(host.write).toHaveBeenCalledOnce());
  complete();
  expect(await screen.findByText(/Last saved:/u)).toBeInTheDocument();
  view.unmount();
  render(<CompanionFolderSyncSection />);
  expect(await screen.findByText(/Last saved:/u)).toBeInTheDocument();
  expect(host.choose).toHaveBeenCalledOnce();
});

it('keeps the previous result and offers folder reselection when permission is lost', async () => {
  location = { token: 'selected', name: 'Documents', authorized: true,
    completion: { sourceId: 'library', generation: 1, checkedAt: '2026-11-04T00:00:00.000Z', pendingResources: 1 } };
  host.write.mockImplementation(async () => { location = { ...location!, authorized: false }; throw new Error('permission_lost'); });
  render(<CompanionFolderSyncSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save now' }));
  expect(await screen.findByText(/Folder access is no longer available/u)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Change folder' })).toBeEnabled();
  expect(screen.getByText(/Last saved:/u)).toBeInTheDocument();
  expect(screen.getByText(/Some attachments have not been copied/u)).toBeInTheDocument();
});

it('does not offer folder writes while device sync is configured', async () => {
  host.read.mockResolvedValue({ location: null, deviceSyncConfigured: true });
  render(<CompanionFolderSyncSection />);
  expect(await screen.findByText(/Device sync is configured/u)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
  expect(host.write).not.toHaveBeenCalled();
});

it('can retry a failed initial state read without writing data', async () => {
  host.read.mockRejectedValueOnce(new Error('unavailable'));
  render(<CompanionFolderSyncSection />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose folder' })).toBeEnabled());
  expect(host.write).not.toHaveBeenCalled();
});

it('hides the capability on hosts without a native directory adapter', () => {
  host.supported = false;
  const view = render(<CompanionFolderSyncSection />);
  expect(view.container).toBeEmptyDOMElement();
  expect(host.read).not.toHaveBeenCalled();
});
