// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { act, node, open, setupPeers } from '../test/dailyFlowExceptions.testSupport';


afterEach(closeLibraries);

function priorSchema(peer: Peer, version: number) {
  // Reproduce the previously shipped payload and columns, preserving genuine operation identities.
  const facts = peer.db.prepare('SELECT id, payload_json FROM daily_flow_sync_facts').all() as { id: string; payload_json: string }[];
  for (const row of facts) {
    const fact = JSON.parse(row.payload_json);
    delete fact.nodeId; delete fact.action; delete fact.statsDelta;
    peer.db.prepare('UPDATE daily_flow_sync_facts SET payload_json=? WHERE id=?').run(JSON.stringify(fact), row.id);
    peer.db.prepare("UPDATE sync_object_state SET content_hash=? WHERE object_type='daily_flow' AND object_id=?")
      .run(computeSyncContentHash('daily_flow', fact), row.id);
  }
  peer.db.exec(`DROP INDEX daily_flow_sync_create; DROP INDEX daily_flow_sync_interval; DROP INDEX daily_flow_sync_parent;
    ALTER TABLE daily_flow_sync_facts DROP COLUMN day_end;
    ALTER TABLE daily_flow_sync_facts DROP COLUMN parent_id;
    ALTER TABLE daily_flow_sync_facts DROP COLUMN kind;
    ALTER TABLE daily_flow_sync_projection DROP COLUMN merged;
    PRAGMA user_version=${version}`);
}

it.each(['desktop', 'companion'] as const)('upgrades %s Flow merge metadata transactionally without rewriting prior facts', async host => {
  const [peer] = await setupPeers();
  node(peer, 'a', 'item');
  await act(peer, await open(peer), 'grade');
  const oldVersion = host === 'desktop' ? 177 : 105;
  priorSchema(peer, oldVersion);
  const facts = () => peer.db.prepare('SELECT id, root_id, occurred_at, day_start, payload_json FROM daily_flow_sync_facts ORDER BY id').all();
  const original = facts();
  const reviews = peer.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const hashes = peer.db.prepare("SELECT object_id, content_hash FROM sync_object_state WHERE object_type='daily_flow' ORDER BY object_id").all();
  const upgrade = async (fail = false) => {
    const beforeVersionCommit = async () => { if (fail) throw new Error('interrupted'); };
    if (host === 'desktop') initializeDatabaseSchema(peer.db, { beforeVersionCommit: () => { if (fail) throw new Error('interrupted'); } });
    else await peer.port.transaction(tx => migrateCompanionDatabase(tx, 105, 106, beforeVersionCommit));
  };
  await expect(upgrade(true)).rejects.toThrow('interrupted');
  expect(peer.db.pragma('user_version', { simple: true })).toBe(oldVersion);
  expect(peer.db.prepare('PRAGMA table_info(daily_flow_sync_facts)').all().some(row => (row as { name: string }).name === 'day_end')).toBe(false);
  expect(facts()).toEqual(original);
  await upgrade();
  expect(peer.db.prepare("SELECT COUNT(*) AS total FROM daily_flow_sync_facts WHERE day_end='' OR kind=''").get()).toEqual({ total: 0 });
  expect(facts()).toEqual(original);
  expect(peer.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(reviews);
  expect(peer.db.prepare("SELECT object_id, content_hash FROM sync_object_state WHERE object_type='daily_flow' ORDER BY object_id").all()).toEqual(hashes);
});
