// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { encodeSyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { openCompanionDependencySession, sessionRoot } from './companionLanDependencySession.js';
import { createCompanionFactSession, readCompanionFactSessionPage } from './companionLanFactSession.js';
import { activatePagedCompanionDependencySession } from './companionLanPagedDependencySession.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
setupSyncPackBuilderTestLifecycle();

async function missingBodySession() {
  insertNodeSyncState();
  const driver = openDatabaseConnection().driver;
  driver.execute("DELETE FROM sync_object_state WHERE object_type = 'setting'");
  driver.execute(`UPDATE node_sync_versions SET body_text = 'retained-body',
    snapshot_json = '{"id":"node-1","content":null}'`);
  driver.execute('UPDATE sync_object_state SET sync_dirty = 0');
  const source = driver.queryOne<{ high_water: number; source_epoch: string }>(
    'SELECT high_water, source_epoch FROM sync_state_sequence WHERE singleton_id = 1')!;
  const fact = await createCompanionFactSession({ groupId: 'group', toPeerId: 'receiver',
    window: { fromStateSeq: 0, toStateSeq: 1, frontierStateSeq: source.high_water,
      sourceEpoch: source.source_epoch } });
  const viewId = fact.view.sourceViewId;
  fact.view.close();
  const first = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId });
  if (!('index' in first)) throw new Error('expected_fact_page');
  const ready = await readCompanionFactSessionPage({ groupId: 'group', peerId: 'receiver', viewId,
    previousIndexId: first.index.index_id,
    claimBits: encodeSyncPackFactClaims(first.index, { versions: [], parents: [], reviews: [] }) });
  expect('ready' in ready && ready.ready).toBe(true);
  return { args: { groupId: 'group', fromPeerId: 'source', toPeerId: 'receiver', viewId },
    root: path.join(sessionRoot('group', 'receiver'), viewId) };
}

function holds(packId: string) {
  const driver = openDatabaseConnection().driver;
  return {
    heads: driver.queryAll(`SELECT object_id, version_id FROM node_version_outbound_holds
      WHERE pack_id = ? ORDER BY object_id, version_id`, [packId]),
    bodies: driver.queryAll(`SELECT object_id, version_id FROM node_version_outbound_payload_holds
      WHERE pack_id = ? ORDER BY object_id, version_id`, [packId])
  };
}

it('rolls back all new retention when the session preparation file cannot be written', async () => {
  const { args, root } = await missingBodySession();
  const staged = path.join(root, 'session.json.preparing');
  await fs.mkdir(staged);
  await expect(activatePagedCompanionDependencySession(args)).rejects.toMatchObject({ code: 'EISDIR' });
  expect(holds(args.viewId)).toEqual({ heads: [], bodies: [] });
  await expect(openCompanionDependencySession('group', 'receiver', args.viewId))
    .rejects.toThrow('sync_pack_source_view_unavailable');
  await fs.rmdir(staged);
  const retry = await activatePagedCompanionDependencySession(args);
  try {
    expect(retry.transfer).toMatchObject({ expectedRows: 1, objectId: 'node-1' });
    expect(holds(args.viewId)).toEqual({
      heads: [{ object_id: 'node-1', version_id: 'desktop#node-1-v1' }],
      bodies: [{ object_id: 'node-1', version_id: 'desktop#node-1-v1' }]
    });
  } finally { retry.view.close(); }
});

it('keeps committed facts and retries publication after reopening the source database', async () => {
  const { args, root } = await missingBodySession();
  const published = path.join(root, 'session.json');
  await fs.mkdir(published);
  await expect(activatePagedCompanionDependencySession(args)).rejects.toBeInstanceOf(Error);
  const retained = holds(args.viewId);
  expect(retained.heads).toHaveLength(1);
  expect(retained.bodies).toHaveLength(1);
  const prepared = JSON.parse(await fs.readFile(path.join(root, 'session.json.preparing'), 'utf8'));
  closeDatabaseConnection();
  await fs.rmdir(published);
  const retry = await activatePagedCompanionDependencySession(args);
  try {
    expect(retry.transfer).toEqual(prepared.transfer);
    expect(holds(args.viewId)).toEqual(retained);
  } finally { retry.view.close(); }
});

it('preserves earlier committed retention if a later preparation attempt fails', async () => {
  const { args, root } = await missingBodySession();
  const first = await activatePagedCompanionDependencySession(args);
  const transfer = first.transfer;
  first.view.close();
  const retained = holds(args.viewId);
  await fs.mkdir(path.join(root, 'session.json.preparing'));
  await expect(activatePagedCompanionDependencySession(args)).rejects.toMatchObject({ code: 'EISDIR' });
  expect(holds(args.viewId)).toEqual(retained);
  const reopened = await openCompanionDependencySession('group', 'receiver', args.viewId);
  try { expect(reopened.transfer).toEqual(transfer); }
  finally { reopened.view.close(); }
});
