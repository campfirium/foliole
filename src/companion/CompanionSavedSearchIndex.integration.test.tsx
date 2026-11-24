// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';
import { CompanionSearchContent } from './CompanionSearchContent';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const openMenu = (title: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name: `Open folder ${title}` }), { key: 'F10', shiftKey: true });

async function renameIndex(from: string, to: string) {
  openMenu(from);
  // A saved search takes its sources from the keyword, so the hand-picked source rows stay hidden.
  expect(screen.queryByRole('button', { name: 'Add source…' })).toBeNull();
  click('Rename');
  const sheet = within(screen.getByRole('dialog', { name: from }));
  fireEvent.change(sheet.getByRole('textbox', { name: 'Name' }), { target: { value: to } });
  fireEvent.click(sheet.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: `Open folder ${to}` });
}

it('saves a mobile keyword search as an index, renames it and moves it to Trash and back without touching its matches', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Primer', 'topic', 'Shelf');
    node(peers.desktop, 'Reference', 'topic', 'Shelf');
    await peers.exchange();
    const sourceFacts = () => peers.desktop.db.prepare(`SELECT id, parent_id, title, content, deleted_at FROM nodes
      WHERE id IN ('Shelf', 'Primer', 'Reference') ORDER BY id`).all();
    const originals = sourceFacts();
    const indexRow = () => peers.desktop.db.prepare(`SELECT title, parent_id, virtual_filter, manual_child_order, deleted_at
      FROM nodes WHERE virtual_filter LIKE '%"text"%'`).all() as Array<Record<string, unknown> & { virtual_filter: string }>;

    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()}><CompanionSearchContent /></BatchDirectoryFixture>);
    expect(screen.queryByRole('button', { name: 'Save search to Virtual' })).toBeNull();
    fireEvent.change(screen.getByTestId('companion-search-input'), { target: { value: '  Primer ' } });
    click('Save search to Virtual');
    expect(await screen.findByText('Saved to Virtual')).toBeVisible();
    await screen.findByRole('button', { name: 'Open folder Primer' });

    await renameIndex('Primer', 'Primer Search');
    await peers.exchange();
    expect(indexRow().map(row => ({ ...row, virtual_filter: JSON.parse(row.virtual_filter) }))).toEqual([{
      title: 'Primer Search', parent_id: 'special-virtual-root',
      virtual_filter: { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'Primer' }] },
      manual_child_order: null, deleted_at: null }]);

    click('Open folder Primer Search');
    expect(await screen.findByRole('button', { name: 'Open topic Primer' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open topic Reference' })).toBeNull();
    click('Library root');

    openMenu('Primer Search');
    click('Move to Trash');
    click('Move to Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Primer Search' })).toBeNull());
    await peers.exchange();
    expect(indexRow()).toEqual([expect.objectContaining({ title: 'Primer Search', deleted_at: expect.any(String) })]);
    expect(sourceFacts()).toEqual(originals);

    click('Open folder Trash');
    openMenu('Primer Search');
    click('Restore from Trash');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open folder Primer Search' })).toBeNull());
    await peers.exchange();
    expect(indexRow()).toEqual([expect.objectContaining({ title: 'Primer Search', deleted_at: null })]);
    expect(sourceFacts()).toEqual(originals);

    cleanup();
    await reopenSearchLibrary(library.root, new Date().toISOString());
    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()} />);
    click('Open folder Primer Search');
    expect(await screen.findByRole('button', { name: 'Open topic Primer' })).toBeVisible();
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
