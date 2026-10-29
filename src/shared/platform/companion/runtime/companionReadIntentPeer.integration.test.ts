// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { flushNodeSyncVersionWithDriver } from '../../../../../electron/database/nodeSyncVersionFromDriver';
import { closeLibraries } from '../../../../../electron/database/syncLibrary.testSupport';
import { softDeleteNodes } from '../../../../../lib/core/database/nodeMutations';
import { hydrateCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { exchangeBodySyncOverHttp } from '../../../../test/bodySyncHttp.testSupport';
import { connectCompanionPeer } from '../../../../test/companionDailySync.testSupport';
import { act as peerAction, node, open, now } from '../../../../test/dailyFlowExceptions.testSupport';
import { currentCompanionRequestSyncDatabaseHost } from '../sync/framed/companionRequestSyncDatabaseHost';

import { companionDailyFlowSettings, loadCompanionDailySession, openCompanionDailyFlow } from './companionDailyFlow';
import { loadCompanionFlowHistory } from './companionFlowHistory';
import { getCompanionReadIntents } from './companionReadIntents';
import { createSearchLibrary } from './companionSearchSnapshot.testSupport';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

it('keeps accepted A/B targets after peer Read/deletion and converges both persisted libraries without duplicate learning', async () => {
  hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  const library = await createSearchLibrary(0);
  const peers = await connectCompanionPeer(library);
  try {
    for (const id of ['a', 'b', 'c']) node(peers.desktop, id, 'topic');
    await exchangeBodySyncOverHttp(peers.desktop, peers.mobile, await currentCompanionRequestSyncDatabaseHost());
    const session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
    const engine = await getCompanionReadIntents();
    let predecessor: string | null = null;
    for (const nodeId of ['a', 'b']) {
      const id = crypto.randomUUID();
      await engine.journal.accept({ id, libraryId: engine.journal.libraryId, nodeId, now,
        dayKey: session.daily!.dayKey, mode: 'recommended', historyKey: 'peer-history', predecessor,
        settings: companionDailyFlowSettings() });
      predecessor = id;
    }
    const peer = await open(peers.desktop, now);
    expect(peer.currentNodeId).toBe('a');
    await peerAction(peers.desktop, peer, 'read', now);
    const deletedAt = '2026-10-26T08:00:10.000Z';
    softDeleteNodes(peers.desktop.driver, { nodeIds: ['b'], deletedAt });
    peers.desktop.driver.execute('UPDATE nodes SET sync_dirty=1 WHERE id=?', ['b']);
    expect(flushNodeSyncVersionWithDriver(peers.desktop.driver, 'b', peers.desktop.name, deletedAt)).toBeTruthy();
    await exchangeBodySyncOverHttp(peers.desktop, peers.mobile, await currentCompanionRequestSyncDatabaseHost());
    expect(library.database.prepare('SELECT deleted_at FROM nodes WHERE id=?').get('b')).toEqual({ deleted_at: deletedAt });
    await engine.restore();
    await expect(engine.drain()).rejects.toThrow('changed');
    expect((await engine.journal.rows(false)).map(row => [row.intent.nodeId, row.state]))
      .toEqual([['a', 'superseded'], ['b', 'superseded']]);
    expect((await loadCompanionDailySession())?.currentNodeId).toBe('c');
    expect((await loadCompanionFlowHistory('peer-history')).undoStack).toHaveLength(0);
    await exchangeBodySyncOverHttp(peers.desktop, peers.mobile, await currentCompanionRequestSyncDatabaseHost());
    expect((await open(peers.desktop, now)).currentNodeId).toBe('c');
    for (const database of [library.database, peers.desktop.db]) {
      expect(database.prepare('SELECT repetition_count FROM node_reading WHERE node_id=?').get('a')).toEqual({ repetition_count: 1 });
      expect(database.prepare('SELECT * FROM node_reading WHERE node_id=?').get('c')).toBeUndefined();
      expect(database.prepare('SELECT deleted_at FROM nodes WHERE id=?').get('b')).toEqual({ deleted_at: deletedAt });
      const facts = database.prepare("SELECT payload_json FROM daily_flow_sync_facts WHERE kind!='create'").all() as { payload_json: string }[];
      expect(facts.map(row => JSON.parse(row.payload_json)).filter(fact => fact.action === 'read')).toHaveLength(1);
    }
  } finally { await library.close(); await closeLibraries(); }
});
