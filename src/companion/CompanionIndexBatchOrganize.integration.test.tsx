// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node, publish } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';
import { CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const reading = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: '2026-11-20T00:00:00.000Z',
  nextAt: '2026-11-30T00:00:00.000Z', priority: 50, readingPosition: 3, repetitionCount: 4, state: 'active' as const };

function openRowMenu(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'F10', shiftKey: true });
}

async function editSources(operation: 'Add' | 'Remove', titles: string[]) {
  openRowMenu('Open folder Mobile Index');
  click(`${operation} source…`);
  const sheet = within(screen.getByRole('dialog', { name: `${operation} source…` }));
  for (const title of titles) {
    fireEvent.change(sheet.getByRole('searchbox'), { target: { value: title.split(' / ').at(-1) } });
    fireEvent.click(sheet.getByRole('button', { name: title }));
  }
  fireEvent.click(sheet.getByRole('button', { name: titles.length > 1 ? `${operation} ${titles.length} sources` : `${operation} source` }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function createIndex() {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'New Here…' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'New Here…' })).getByRole('button', { name: 'Create in Virtual' }));
  const sheet = within(screen.getByRole('dialog', { name: 'Create in Virtual' }));
  fireEvent.change(sheet.getByRole('textbox', { name: 'Name' }), { target: { value: 'Mobile Index' } });
  fireEvent.click(sheet.getByRole('button', { name: 'Create in Virtual' }));
}

async function selectAllAndApply(action: string) {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Select' }));
  click('Select all');
  click(action);
}

it('adds and removes several manual index sources at once, undoably, and the desktop reads them back', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    for (const id of ['Primer', 'Reference', 'Atlas']) node(peers.desktop, id, 'topic', 'Shelf');
    await peers.exchange();
    const indexOrder = () => peers.desktop.db.prepare('SELECT manual_child_order FROM nodes WHERE title = ?').get('Mobile Index');

    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()}><CompanionWorkspaceHistoryActions /></BatchDirectoryFixture>);
    createIndex();
    await screen.findByRole('button', { name: 'Open folder Mobile Index' });
    await editSources('Add', ['Shelf / Primer', 'Shelf / Reference', 'Shelf / Atlas']);
    await peers.exchange();
    expect(indexOrder()).toEqual({ manual_child_order: '["Primer","Reference","Atlas"]' });

    await editSources('Remove', ['Shelf / Primer', 'Shelf / Atlas']);
    click('Open folder Mobile Index');
    expect(await screen.findByRole('button', { name: 'Open topic Reference' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Primer' })).toBeNull();
    click('Library root');

    click('Undo Remove Sources');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Remove Sources' })).toBeEnabled());
    await peers.exchange();
    expect(indexOrder()).toEqual({ manual_child_order: '["Primer","Reference","Atlas"]' });
    click('Undo Add Sources');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Add Sources' })).toBeEnabled());
    await peers.exchange();
    expect(indexOrder()).toEqual({ manual_child_order: null });
    click('Redo Add Sources');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Remove Sources' })).toBeEnabled());
    await peers.exchange();
    expect(indexOrder()).toEqual({ manual_child_order: '["Primer","Reference","Atlas"]' });

    cleanup();
    await reopenSearchLibrary(library.root, new Date().toISOString());
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Mobile Index');
    for (const title of ['Primer', 'Reference', 'Atlas']) expect(await screen.findByRole('button', { name: `Open topic ${title}` })).toBeVisible();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});

it('unshelves the selected shelved topics and relearns the selected removed topics as undoable batches', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    for (const id of ['Shelved A', 'Shelved B', 'Removed A', 'Removed B']) node(peers.desktop, id, 'topic', 'Shelf');
    const stamp = '2026-11-21T00:00:00.000Z';
    for (const id of ['Shelved A', 'Shelved B']) {
      peers.desktop.db.prepare('UPDATE nodes SET shelved_at = ? WHERE id = ?').run(stamp, id);
      publish(peers.desktop, id, stamp);
    }
    for (const id of ['Removed A', 'Removed B']) {
      saveNodeReadingStateWithSync(peers.desktop.driver, { nodeId: id, hostName: peers.desktop.name, reading, updatedAt: stamp });
      peers.desktop.db.prepare('UPDATE nodes SET deleted_at = ?, shelved_at = ? WHERE id = ?').run(stamp, id === 'Removed B' ? stamp : null, id);
      publish(peers.desktop, id, stamp);
    }
    await peers.exchange();
    const shelved = () => peers.desktop.db.prepare(`SELECT id, shelved_at FROM nodes WHERE id IN ('Shelved A', 'Shelved B') ORDER BY id`).all();
    const removed = () => peers.desktop.db.prepare(`SELECT n.id, n.deleted_at IS NOT NULL AS trashed, n.shelved_at, r.state FROM nodes n
      LEFT JOIN node_reading r ON r.node_id = n.id WHERE n.id IN ('Removed A', 'Removed B') ORDER BY n.id`).all();

    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()}><CompanionWorkspaceHistoryActions /></BatchDirectoryFixture>);
    // The built-in views live under the Virtual root, which the first index creates.
    createIndex();
    fireEvent.click(await screen.findByRole('button', { name: 'Open folder Shelved' }));
    await screen.findByRole('button', { name: 'Open topic Shelved A' });
    await selectAllAndApply('Unshelve');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open topic Shelved A' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Open topic Shelved B' })).toBeNull();
    await peers.exchange();
    expect(shelved()).toEqual([{ id: 'Shelved A', shelved_at: null }, { id: 'Shelved B', shelved_at: null }]);
    click('Undo Unshelve');
    expect(await screen.findByRole('button', { name: 'Open topic Shelved A' })).toBeVisible();
    await peers.exchange();
    expect(shelved()).toEqual([{ id: 'Shelved A', shelved_at: expect.any(String) }, { id: 'Shelved B', shelved_at: expect.any(String) }]);

    click('Library root');
    click('Open folder Removed');
    await screen.findByRole('button', { name: 'Open topic Removed A' });
    await selectAllAndApply('Relearn');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Relearn' })).toBeEnabled());
    // Relearning keeps the topics in Removed, as on the desktop.
    expect(screen.getByRole('button', { name: 'Open topic Removed A' })).toBeVisible();
    await peers.exchange();
    expect(removed()).toEqual([{ id: 'Removed A', trashed: 1, shelved_at: null, state: null },
      { id: 'Removed B', trashed: 1, shelved_at: null, state: null }]);
    click('Undo Relearn');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Relearn' })).toBeEnabled());
    await peers.exchange();
    expect(removed()).toEqual([{ id: 'Removed A', trashed: 1, shelved_at: null, state: 'active' },
      { id: 'Removed B', trashed: 1, shelved_at: expect.any(String), state: 'active' }]);

    cleanup();
    const { db } = await reopenSearchLibrary(library.root, new Date().toISOString());
    expect(db.prepare(`SELECT n.id, n.shelved_at IS NOT NULL AS shelved, r.repetition_count FROM nodes n
      LEFT JOIN node_reading r ON r.node_id = n.id WHERE n.id IN ('Removed A', 'Shelved A') ORDER BY n.id`).all())
      .toEqual([{ id: 'Removed A', shelved: 0, repetition_count: 4 }, { id: 'Shelved A', shelved: 1, repetition_count: null }]);
    expect((await readSnapshot()).nodesById['Shelved A']?.shelvedAt).toBeTruthy();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
