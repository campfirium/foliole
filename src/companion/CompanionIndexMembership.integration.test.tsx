// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

function openIndexMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Open folder Mobile Index' }), { key: 'F10', shiftKey: true });
}

async function editSource(operation: 'Add' | 'Remove', title: string) {
  openIndexMenu();
  click(`${operation} source…`);
  const sheet = within(screen.getByRole('dialog', { name: `${operation} source…` }));
  fireEvent.change(sheet.getByRole('searchbox'), { target: { value: title.split(' / ').at(-1) } });
  fireEvent.click(sheet.getByRole('button', { name: title }));
  fireEvent.click(sheet.getByRole('button', { name: `${operation} source` }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

function createIndex() {
  // Root creation lives in the top-right menu's "New Here…" view.
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'More' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'New Here…' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'New Here…' })).getByRole('button', { name: 'Create in Virtual' }));
  const sheet = within(screen.getByRole('dialog', { name: 'Create in Virtual' }));
  fireEvent.change(sheet.getByRole('textbox', { name: 'Name' }), { target: { value: 'Mobile Index' } });
  fireEvent.click(sheet.getByRole('button', { name: 'Create in Virtual' }));
}

it('edits a new manual index at its real mobile entry, preserving sources across sync and reopen', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    node(peers.desktop, 'Cabinet', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Reference', 'topic', 'Cabinet');
    node(peers.desktop, 'Primer', 'topic', 'Shelf');
    await peers.exchange();
    const sourceFacts = () => peers.desktop.db.prepare(`SELECT id, parent_id, content, deleted_at FROM nodes
      WHERE id IN ('Shelf', 'Primer', 'Reference') ORDER BY id`).all();
    const originals = sourceFacts();

    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    createIndex();
    await screen.findByRole('button', { name: 'Open folder Mobile Index' });
    await editSource('Add', 'Cabinet / Reference');
    await editSource('Add', 'Shelf');
    click('Open folder Mobile Index');
    expect(await screen.findByRole('button', { name: 'Open topic Primer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open topic Reference' })).toBeVisible();
    click('Library root');
    await editSource('Remove', 'Cabinet / Reference');
    click('Open folder Mobile Index');
    expect(screen.getByRole('button', { name: 'Open topic Primer' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Reference' })).toBeNull();
    click('Library root');
    openIndexMenu();
    click('Move to Trash');
    click('Move to Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Mobile Index' })).toBeNull());
    await peers.exchange();
    const indexRow = () => peers.desktop.db.prepare('SELECT manual_child_order, deleted_at FROM nodes WHERE title = ?').get('Mobile Index');
    expect(indexRow()).toEqual({ manual_child_order: '["Shelf"]', deleted_at: expect.any(String) });
    expect(sourceFacts()).toEqual(originals);
    click('Open folder Trash');
    openIndexMenu();
    click('Restore from Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Mobile Index' })).toBeNull());
    await peers.exchange();
    expect(indexRow()).toEqual({ manual_child_order: '["Shelf"]', deleted_at: null });
    expect(sourceFacts()).toEqual(originals);

    cleanup();
    await reopenSearchLibrary(library.root, new Date().toISOString());
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Mobile Index');
    expect(await screen.findByRole('button', { name: 'Open topic Primer' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Reference' })).toBeNull();
    click('Library root');
    click('Open folder Cabinet');
    expect(screen.getByRole('button', { name: 'Open topic Reference' })).toBeVisible();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
