// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getViewHideDismissedTopics, requestToggleDismissedTopicVisibility } from '../shared/platform/runtime/dismissedTopicVisibilitySetting';
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
  expect(screen.queryByRole('button', { name: 'Select', exact: true })).toBeNull();
  click('More');
  const menu = screen.getByRole('dialog', { name: 'Browse menu' });
  fireEvent.click(within(menu).getByRole('button', { name: 'Select', exact: true }));
  expect(menu).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More', exact: true })).toBeNull();
}

function trashed(db: Database.Database) {
  return db.prepare("SELECT id FROM nodes WHERE deleted_at IS NOT NULL ORDER BY id").pluck().all();
}

it('selects within one list and moves the chosen roots and their subtrees to Trash on both libraries', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Folder A', 'folder');
    node(peers.desktop, 'Folder B', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Child A', 'topic', 'Folder A');
    node(peers.desktop, 'Child B', 'topic', 'Folder B');
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    enterSelection();
    click('Select all in this list');
    expect(screen.getByText('2 of 2 selected in this list')).toBeVisible();
    click('Cancel');
    expect(screen.getByRole('heading', { name: 'Directory' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'More', exact: true })).toBeVisible();
    click('Open folder Folder A');
    enterSelection();
    expect(screen.getByText('0 of 1 selected in this list')).toBeVisible();
    click('Select Child A');
    expect(screen.getByRole('checkbox', { name: 'Select Child A' })).toBeChecked();
    click('Select Child A');
    expect(screen.getByRole('checkbox', { name: 'Select Child A' })).not.toBeChecked();
    click('Select all in this list');
    click('Library root');
    enterSelection();
    expect(screen.getByText('0 of 2 selected in this list')).toBeVisible();
    click('Select all in this list');
    confirmMoveToTrash();
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Folder A')).toBeNull());
    await peers.exchange();
    const expected = ['Child A', 'Child B', 'Folder A', 'Folder B'];
    expect(trashed(peers.desktop.db)).toEqual(expected);
    cleanup();
    const reopened = await reopenSearchLibrary(library.root, new Date().toISOString());
    expect(trashed(reopened.db)).toEqual(expected);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

function confirmMoveToTrash(count = 2) {
  click('Move to Trash');
  const confirmation = screen.getByRole('dialog', { name: 'Move to Trash' });
  expect(within(confirmation).getByText(`Move ${count} selected entries and their contents to Trash?`)).toBeVisible();
  fireEvent.click(within(confirmation).getByRole('button', { name: 'Move to Trash' }));
}

it('restores multiple selected entries and their children while leaving the remaining Trash alone', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    for (const id of ['Folder A', 'Folder B', 'Folder C']) node(peers.desktop, id, 'folder');
    await peers.exchange();
    node(peers.desktop, 'Child A', 'topic', 'Folder A');
    await peers.exchange();
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    enterSelection();
    click('Select all in this list');
    confirmMoveToTrash(3);
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Folder A')).toBeNull());
    await peers.exchange();
    click('Open folder Trash');
    enterSelection();
    expect(screen.getByText('0 of 4 selected in this list')).toBeVisible();
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
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    enterSelection();
    click('Select all in this list');
    confirmMoveToTrash();
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Folder A')).toBeNull());
    await peers.exchange();
    click('Open folder Trash');
    click('Open folder Folder A');
    enterSelection();
    click('Select all in this list');
    expect(screen.getByText('2 of 2 selected in this list')).toBeVisible();
    click('Delete Permanently');
    let confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' });
    expect(within(confirmation).getByText(/2 selected entries.*2 entries.*cannot be undone/)).toBeVisible();
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
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    enterSelection();
    click('Select all in this list');
    confirmMoveToTrash();
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Folder A')).toBeNull());
    click('Open folder Trash');
    enterSelection();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Folder B' }));
    click('Delete Permanently');
    const confirmation = screen.getByRole('dialog', { name: 'Delete Permanently' });
    expect(within(confirmation).getByText(/2 selected entries.*3 entries/)).toBeVisible();
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

it('removes filtered-out topics from the selection and keeps them unselected when the filter is cleared', async () => {
  const library = await createSearchLibrary(0);
  try {
    const { desktop, exchange } = await connectCompanionPeer(library);
    node(desktop, 'Folder A', 'folder');
    await exchange();
    node(desktop, 'Topic A', 'topic', 'Folder A');
    node(desktop, 'Topic B', 'topic', 'Folder A');
    await exchange();
    await mutateCompanionWorkspace({ type: 'shelve', nodeId: 'Topic B' });
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Folder A');
    enterSelection();
    click('Select all in this list');
    expect(screen.getByText('2 of 2 selected in this list')).toBeVisible();
    click('Toggle Topic Focus');
    expect(screen.queryByRole('checkbox', { name: 'Select Topic B' })).toBeNull();
    expect(screen.getByText('1 of 1 selected in this list')).toBeVisible();
    click('Toggle Topic Focus');
    expect(screen.getByRole('checkbox', { name: 'Select Topic B' })).not.toBeChecked();
    expect(screen.getByText('1 of 2 selected in this list')).toBeVisible();
    confirmMoveToTrash(1);
    await waitFor(() => expect(screen.queryByTestId('companion-directory-node-Topic A')).toBeNull());
    expect(screen.getByRole('button', { name: 'Open topic Topic B' })).toBeVisible();
    await exchange();
    expect(trashed(desktop.db)).toEqual(['Topic A']);
  } finally {
    cleanup();
    if (getViewHideDismissedTopics()) requestToggleDismissedTopicVisibility();
    await library.close();
    await closeLibraries();
  }
});
