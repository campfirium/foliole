// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { restorePreLocalDerivedIndexSchema } from '../../electron/database/localDerivedIndexMigration.testSupport';
import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract';
import { act, assertDurable, node, open, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it.each(['desktop', 'companion'] as const)('upgrades a %s day list in place and derives its queue readiness on the next open', async host => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  for (const id of ['x', 'y']) node(peer, id, 'item');
  let session = await open(peer);
  session = await act(peer, session, ['x', 'y'].includes(session.currentNodeId!) ? 'grade' : 'read');
  const rows = await readCycleRows(peer.port);
  const stored = await readDailyFlow(peer.port);
  // Both historical versions predate the readiness table and the dirty-scope completion marker.
  const [from, to] = host === 'desktop' ? [195, DATABASE_SCHEMA_VERSION] : [122, COMPANION_DATABASE_VERSION];
  peer.db.exec('DROP TRIGGER daily_flow_scope_kind');
  restorePreLocalDerivedIndexSchema(peer.db, from);
  peer.db.exec('DROP TRIGGER daily_flow_entry_readiness_retire; DROP TABLE daily_flow_entry_readiness');
  if (host === 'desktop') initializeDatabaseSchema(peer.db);
  else await peer.port.transaction(tx => migrateCompanionDatabase(tx, from, to));
  expect(peer.db.pragma('user_version', { simple: true })).toBe(to);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(await readDailyFlow(peer.port)).toEqual({ ...stored, invalidated: 1, scope_complete: 0 });
  expect(peer.db.prepare('SELECT COUNT(*) FROM daily_flow_entry_readiness').pluck().get()).toBe(0);

  const reopened = await open(peer);
  expect(reopened.currentNodeId).toBe(session.currentNodeId);
  expect((reopened.readTopicCount ?? 0) + (reopened.reviewedItemCount ?? 0)).toBe(1);
  expect(reopened.cycle?.remaining).toBe(session.cycle?.remaining);
  await assertDurable(peer, reopened);
  const active = peer.db.prepare('SELECT node_id FROM daily_flow_entries WHERE active=1 ORDER BY node_id').pluck().all();
  expect(peer.db.prepare('SELECT node_id FROM daily_flow_entry_readiness ORDER BY node_id').pluck().all()).toEqual(active);
  const kinds = peer.db.prepare('SELECT node_id, kind FROM daily_flow_entry_readiness').all() as { node_id: string; kind: string }[];
  expect(kinds.length).toBeGreaterThan(1);
  for (const row of kinds) expect(row.kind).toBe(['x', 'y'].includes(row.node_id) ? 'review' : 'reading');
  // Rewriting a row drops what was derived for its previous state.
  const rewritten = kinds[0]!.node_id;
  peer.db.prepare('DELETE FROM daily_flow_entries WHERE node_id=?').run(rewritten);
  expect(peer.db.prepare('SELECT COUNT(*) FROM daily_flow_entry_readiness WHERE node_id=?').pluck().get(rewritten)).toBe(0);
});
