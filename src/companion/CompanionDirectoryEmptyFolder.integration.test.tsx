// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot } from './companionDirectoryBatch.test-support';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

it('restores one ordinary folder and its contents from its Trash row without selecting unrelated entries', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Archive', 'folder');
    node(peers.desktop, 'Unrelated', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Archived Topic', 'topic', 'Archive');
    await peers.exchange();
    await mutateCompanionWorkspace({ type: 'delete', nodeId: 'Archive' });
    await mutateCompanionWorkspace({ type: 'delete', nodeId: 'Unrelated' });
    renderWithLocalization(<BatchDirectoryFixture initial={await readBatchDirectorySnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open folder Trash' }));
    expect(screen.queryByRole('button', { name: 'More: Archive' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open folder Archive' }), { key: 'F10', shiftKey: true });
    const menu = within(screen.getByRole('dialog', { name: 'More' }));
    fireEvent.click(menu.getByRole('button', { name: 'Restore from Trash' }));
    expect(await screen.findByRole('button', { name: 'Open folder Unrelated' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Library root' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder Archive' }));
    expect(await screen.findByRole('button', { name: 'Open topic Archived Topic' })).toBeVisible();
    await peers.exchange();
    expect(peers.desktop.db.prepare('SELECT id FROM nodes WHERE deleted_at IS NOT NULL ORDER BY id').pluck().all()).toEqual(['Unrelated']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [{ id: 'external', folderPath: '/External' }] }),
  useCompanionExternalDocument: () => null
}));

it('creates a Topic from the empty ordinary folder and offers no create action in read-only views', async () => {
  const library = await createSearchLibrary(0);
  try {
    await mutateCompanionWorkspace({ type: 'create', kind: 'folder', nodeId: 'empty', title: 'Empty folder', parentNodeId: null });
    renderWithLocalization(<BatchDirectoryFixture initial={await readBatchDirectorySnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open folder Empty folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to this folder' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'First Topic' } });
    fireEvent.click(within(name.closest('form')!).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Open topic First Topic' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add to this folder' })).toBeNull();
    expect(library.database.prepare('SELECT parent_id, kind FROM nodes WHERE title = ?').get('First Topic'))
      .toEqual({ parent_id: 'empty', kind: 'topic' });

    for (const title of ['Trash', 'External']) {
      fireEvent.click(screen.getByRole('button', { name: 'Library root' }));
      fireEvent.click(screen.getByRole('button', { name: `Open folder ${title}` }));
      expect(screen.queryByRole('button', { name: 'Add to this folder' })).toBeNull();
    }
  } finally {
    cleanup();
    await library.close();
  }
});
