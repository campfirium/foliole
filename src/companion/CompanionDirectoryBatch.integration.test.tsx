// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createDive, listDives } from '../../electron/database/diveRepository';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';

const runtime = vi.hoisted(() => ({ platform: 'android' }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => runtime.platform, isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('./useCompanionExternalDirectory', () => ({
  useCompanionExternalDirectory: () => ({ entries: [], folders: [] }),
  useCompanionExternalDocument: () => null
}));

afterEach(() => { runtime.platform = 'android'; });

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

function enterSelection() {
  expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  click('More');
  const menu = screen.getByRole('dialog');
  fireEvent.click(within(menu).getByRole('button', { name: 'Select' }));
  expect(menu).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
}

function trashed(db: Database.Database) {
  return db.prepare("SELECT id FROM nodes WHERE deleted_at IS NOT NULL ORDER BY id").pluck().all();
}

it('offers bulk Trash actions inside a folder, with selection after history and none at the directory home', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Folder A', 'folder');
    await peers.exchange();
    for (const title of ['Child A', 'Child B']) node(peers.desktop, title, 'topic', 'Folder A');
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('More');
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Select' })).toBeNull();
    click('Close');

    click('Open folder Folder A');
    click('More');
    const menu = within(screen.getByRole('dialog'));
    const select = menu.getByRole('button', { name: 'Select' });
    expect(menu.getByRole('button', { name: 'Redo' }).compareDocumentPosition(select))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.click(select);
    const actionBar = within(screen.getByTestId('companion-selection-action-bar'));
    expect(actionBar.getByRole('button', { name: 'Move to Trash' })).toBeDisabled();
    click('Select all');
    expect(screen.getByText('2 / 2 selected')).toBeVisible();
    fireEvent.click(actionBar.getByRole('button', { name: 'Move to Trash' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Move to Trash' }));
    fireEvent.click(confirm.getByRole('button', { name: 'Move to Trash' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Child A' })).toBeNull());
    await peers.exchange();
    expect(trashed(peers.desktop.db)).toEqual(['Child A', 'Child B']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('removes selected direct sources from a Dive as a batch and preserves the original materials across sync', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Direct', 'topic');
    node(peers.desktop, 'Keep', 'topic');
    await peers.exchange();
    node(peers.desktop, 'Derived', 'topic', 'Shelf');
    const dive = createDive(peers.desktop.db, 'Probability', ['Shelf', 'Direct', 'Keep']);
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Probability');
    enterSelection();

    expect(screen.queryByRole('checkbox', { name: 'Select Derived' })).toBeNull();
    expect(screen.getByText(/brought in by a folder have no checkbox/)).toBeVisible();
    for (const title of ['Shelf', 'Direct']) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }));
    }
    expect(screen.getByText('2 / 3 selected')).toBeVisible();
    click('Remove from This Dive');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Direct' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Open topic Keep' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Derived' })).toBeNull();

    await peers.exchange();
    expect(listDives(peers.desktop.db).find(entry => entry.id === dive.id)?.directSourceIds).toEqual(['Keep']);
    const snapshot = await readSnapshot();
    expect(snapshot.nodesById[dive.id]?.manualChildOrder).toEqual(['Keep']);
    expect(snapshot.nodesById.Derived?.parentNodeId).toBe('Shelf');
    expect(trashed(peers.desktop.db)).toEqual([]);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

async function prepareTrash(ids: string[]) {
  const snapshot = await readSnapshot();
  await moveCompanionBatchToTrash(ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! })));
}

it('restores multiple selected entries and their children while leaving the remaining Trash alone', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Folder A', 'Folder B', 'Folder C']) node(peers.desktop, id, 'folder');
    await peers.exchange();
    node(peers.desktop, 'Child A', 'topic', 'Folder A');
    await peers.exchange();
    await prepareTrash(['Folder A', 'Folder B', 'Folder C']);
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Trash');
    enterSelection();
    expect(screen.getByText('0 / 4 selected')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder B' }));
    click('Restore');
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Folder B')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open folder Folder C' })).toBeVisible();
    click('Library root');
    click('Open folder Folder A');
    expect(screen.getByRole('button', { name: 'Open topic Child A' })).toBeVisible();
    await peers.exchange();
    expect(trashed(peers.desktop.db)).toEqual(['Folder C']);
    cleanup();
    const reopened = await reopenSearchLibrary(library.root, new Date().toISOString());
    expect(trashed(reopened.db)).toEqual(['Folder C']);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

function nodeIds(db: Database.Database) {
  return db.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").pluck().all();
}

it.each(['android', 'ios'])('permanently deletes within a Trash folder and keeps the other subtree (%s runtime)', async platform => {
  runtime.platform = platform;
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Folder A', 'Folder B']) node(peers.desktop, id, 'folder');
    await peers.exchange();
    node(peers.desktop, 'Child A1', 'topic', 'Folder A');
    node(peers.desktop, 'Child A2', 'topic', 'Folder A');
    node(peers.desktop, 'Child B', 'topic', 'Folder B');
    await peers.exchange();
    await prepareTrash(['Folder A', 'Folder B']);
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Trash');
    click('Open folder Folder A');
    enterSelection();
    click('Select all');
    expect(screen.getByText('2 / 2 selected')).toBeVisible();
    click('Delete Permanently');
    let confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' });
    expect(within(confirmation).getByText(/2 selected materials.*2 materials.*cannot be undone/)).toBeVisible();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(nodeIds(library.database)).toEqual(['Child A1', 'Child A2', 'Child B', 'Folder A', 'Folder B']);
    click('Delete Permanently');
    confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete Permanently' }));
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Child A1')).toBeNull());
    await peers.exchange();
    const expected = ['Child B', 'Folder A', 'Folder B'];
    expect(nodeIds(peers.desktop.db)).toEqual(expected);
    cleanup();
    const reopened = await reopenSearchLibrary(library.root, new Date().toISOString());
    expect(nodeIds(reopened.db)).toEqual(expected);
    for (const db of [reopened.db, peers.desktop.db]) {
      expect(db.prepare('SELECT node_id FROM node_sync_tombstones ORDER BY node_id').pluck().all()).toEqual(['Child A1', 'Child A2']);
      expect(db.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id LIKE 'Child A%' AND body_text IS NOT NULL").pluck().get()).toBe(0);
    }
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('rejects a confirmed subtree that has changed before the permanent write', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Folder A', 'Folder B']) node(peers.desktop, id, 'folder');
    await peers.exchange();
    node(peers.desktop, 'Child A', 'topic', 'Folder A');
    await peers.exchange();
    await prepareTrash(['Folder A', 'Folder B']);
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Trash');
    enterSelection();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder B' }));
    click('Delete Permanently');
    const confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' });
    expect(within(confirmation).getByText(/2 selected materials.*3 materials/)).toBeVisible();
    const snapshot = await readSnapshot();
    await restoreCompanionBatchFromTrash([{ id: 'Child A', version: snapshot.nodesById['Child A']!.currentVersionId! }]);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete Permanently' }));
    await waitFor(() => expect(screen.getByText('Could not apply the batch. Refresh the list and try again.')).toBeVisible());
    expect(nodeIds(library.database)).toEqual(['Child A', 'Folder A', 'Folder B']);
    expect(trashed(library.database)).toEqual(['Folder A', 'Folder B']);
    expect(library.database.prepare('SELECT count(*) FROM node_sync_tombstones').pluck().get()).toBe(0);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
