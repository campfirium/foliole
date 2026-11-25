// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node } from '../test/dailyFlowExceptions.testSupport';

import { BatchDirectoryFixture, readBatchDirectorySnapshot as readSnapshot } from './companionDirectoryBatch.test-support';
import { CompanionWorkspaceHistoryActions } from './CompanionWorkspaceActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const reading = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: '2026-11-20T00:00:00.000Z',
  nextAt: '2026-11-30T00:00:00.000Z', priority: 50, readingPosition: 3, repetitionCount: 4, state: 'active' as const };

function openTopicMenu(title: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Open topic ${title}` }), { key: 'F10', shiftKey: true });
  return within(screen.getByRole('dialog', { name: title }));
}

it('dismisses a topic with its extracts in one undoable step, leaving items alone, and the desktop reads it back', async () => {
  const library = await createSearchLibrary(0);
  try {
    const peers = await connectCompanionPeer(library);
    node(peers.desktop, 'Shelf', 'folder');
    await peers.exchange();
    node(peers.desktop, 'Branch', 'topic', 'Shelf');
    await peers.exchange();
    node(peers.desktop, 'Extract', 'topic', 'Branch');
    node(peers.desktop, 'Card', 'item', 'Branch');
    await peers.exchange();
    node(peers.desktop, 'Deep extract', 'topic', 'Extract');
    saveNodeReadingStateWithSync(peers.desktop.driver, { nodeId: 'Extract', hostName: peers.desktop.name, reading,
      updatedAt: '2026-11-21T00:00:00.000Z' });
    await peers.exchange();
    const states = () => peers.desktop.db.prepare(`SELECT n.id, r.state FROM nodes n LEFT JOIN node_reading r ON r.node_id = n.id
      WHERE n.id IN ('Branch', 'Extract', 'Deep extract', 'Card') ORDER BY n.id`).all();
    const before = [{ id: 'Branch', state: null }, { id: 'Card', state: null },
      { id: 'Deep extract', state: null }, { id: 'Extract', state: 'active' }];
    expect(states()).toEqual(before);

    renderWithLocalization(<BatchDirectoryFixture initial={await readSnapshot()}><CompanionWorkspaceHistoryActions /></BatchDirectoryFixture>);
    click('Open folder Shelf');
    await screen.findByRole('button', { name: 'Open topic Branch' });
    fireEvent.click(openTopicMenu('Branch').getByRole('button', { name: 'Dismiss topic' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Dismiss' })).toBeEnabled());
    await peers.exchange();
    const dismissed = [{ id: 'Branch', state: 'dismissed' }, { id: 'Card', state: null },
      { id: 'Deep extract', state: 'dismissed' }, { id: 'Extract', state: 'dismissed' }];
    expect(states()).toEqual(dismissed);
    // Nothing is left to dismiss in the branch, so the menu no longer offers it.
    expect(openTopicMenu('Branch').queryByRole('button', { name: 'Dismiss topic' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Branch' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Branch' })).toBeNull());

    click('Undo Dismiss');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo Dismiss' })).toBeEnabled());
    // Undo restores every reading on this device, including the progress the extract had before.
    const restored = (await readSnapshot()).nodesById;
    expect(['Branch', 'Extract', 'Deep extract', 'Card'].map(id => restored[id]?.reading?.state ?? null))
      .toEqual([null, 'active', null, null]);
    expect(restored['Extract']?.reading?.repetitionCount).toBe(4);

    click('Redo Dismiss');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo Dismiss' })).toBeEnabled());
    await peers.exchange();
    expect(states()).toEqual(dismissed);
  } finally {
    cleanup();
    await library.close();
    await closeLibraries();
  }
});
