// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createDive, listDives } from '../../electron/database/diveRepository';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const parentOf = (db: Database.Database, id: string) => db.prepare('SELECT parent_id FROM nodes WHERE id = ?').pluck().get(id);

function selectAllInFolder(folder: string) {
  click(`Open folder ${folder}`);
  click('More');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select' }));
  click('Select all');
}

it('moves the selected topics to another folder as one action and syncs the new parent', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Inbox A', 'Archive']) node(peers.desktop, id, 'folder');
    await peers.exchange();
    for (const id of ['Note 1', 'Note 2']) node(peers.desktop, id, 'topic', 'Inbox A');
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    selectAllInFolder('Inbox A');
    fireEvent.click(within(screen.getByTestId('companion-selection-action-bar')).getByRole('button', { name: 'Move' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Move 2 entries' }));
    fireEvent.change(sheet.getByRole('searchbox'), { target: { value: 'Archive' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Archive' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Move to...' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Note 1' })).toBeNull());
    await peers.exchange();
    expect([parentOf(peers.desktop.db, 'Note 1'), parentOf(peers.desktop.db, 'Note 2')]).toEqual(['Archive', 'Archive']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('offers only destinations valid for every selected folder when moving several at once', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Parent', 'folder');
    await peers.exchange();
    for (const id of ['Box A', 'Box B', 'Target']) node(peers.desktop, id, 'folder', 'Parent');
    await peers.exchange();
    node(peers.desktop, 'Inner', 'folder', 'Box A');
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Parent');
    click('More');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select' }));
    for (const title of ['Box B', 'Box A']) fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }));
    fireEvent.click(within(screen.getByTestId('companion-selection-action-bar')).getByRole('button', { name: 'Move' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Move 2 entries' }));
    fireEvent.change(sheet.getByRole('searchbox'), { target: { value: 'Inner' } });
    expect(sheet.queryByRole('button', { name: /Inner/ })).toBeNull();
    fireEvent.change(sheet.getByRole('searchbox'), { target: { value: 'Target' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Parent / Target' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Move to...' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await peers.exchange();
    expect([parentOf(peers.desktop.db, 'Box A'), parentOf(peers.desktop.db, 'Box B')]).toEqual(['Target', 'Target']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('adds the selected topics to a Dive in one write and keeps them in their folder', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    for (const id of ['Card 1', 'Card 2']) node(peers.desktop, id, 'topic', 'Shelf');
    const dive = createDive(peers.desktop.db, 'Probability', []);
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    selectAllInFolder('Shelf');
    fireEvent.click(within(screen.getByTestId('companion-selection-action-bar')).getByRole('button', { name: 'Add to Dive' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Add 2 entries to a Dive' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Probability' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await peers.exchange();
    expect(listDives(peers.desktop.db)).toContainEqual(expect.objectContaining({
      id: dive.id, directSourceIds: expect.arrayContaining(['Card 1', 'Card 2'])
    }));
    expect(parentOf(peers.desktop.db, 'Card 1')).toBe('Shelf');
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('empties Trash from its menu after confirmation and keeps library entries', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Old A', 'Old B', 'Keep']) node(peers.desktop, id, 'topic');
    await peers.exchange();
    const snapshot = await readSnapshot();
    await moveCompanionBatchToTrash(['Old A', 'Old B'].map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! })));
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Trash');
    click('More');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Empty Trash…' }));
    const confirmation = within(screen.getByRole('dialog', { name: 'Delete Permanently' }));
    fireEvent.click(confirmation.getByRole('button', { name: 'Delete Permanently' }));
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Old A')).toBeNull());
    await peers.exchange();
    const ids = (db: Database.Database) => db.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").pluck().all();
    expect(ids(peers.desktop.db)).toEqual(['Keep']);
    cleanup();
    const reopened = await reopenSearchLibrary(library.root, new Date().toISOString());
    expect(ids(reopened.db)).toEqual(['Keep']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
