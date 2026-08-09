import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { clearConfirmedSyncPushAcksWithDbPort } from '../../lib/core/sync/syncPackPushAcksExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('confirms only the authenticated peer whose committed stream passed the accepted position', async () => {
  const fixture = await createFixture(8);
  try {
    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(fixture.sqlite), {
      incomingAlias: 'incoming', sourcePeerId: 'desktop-b', toStateSeq: 8
    });

    expect(readState(fixture.sqlite)).toEqual({ sync_dirty: 1 });
    expect(readReceipts(fixture.sqlite)).toEqual([
      { peer_id: 'desktop-b', status: 'accepted' },
      { peer_id: 'desktop-c', status: 'pending' }
    ]);
  } finally {
    await fixture.close();
  }
});

it('keeps global dirty while another peer still has an unterminated obligation', async () => {
  const fixture = await createFixture(9);
  try {
    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(fixture.sqlite), {
      incomingAlias: 'incoming', sourcePeerId: 'desktop-b', toStateSeq: 9
    });

    expect(readState(fixture.sqlite)).toEqual({ sync_dirty: 1 });
    expect(readReceipts(fixture.sqlite)).toEqual([
      { peer_id: 'desktop-b', status: 'confirmed' },
      { peer_id: 'desktop-c', status: 'pending' }
    ]);
  } finally {
    await fixture.close();
  }
});

it('does not confirm an accepted receipt from a different authenticated peer', async () => {
  const fixture = await createFixture(9);
  try {
    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(fixture.sqlite), {
      incomingAlias: 'incoming', sourcePeerId: 'desktop-c', toStateSeq: 9
    });

    expect(readState(fixture.sqlite)).toEqual({ sync_dirty: 1 });
    expect(readReceipts(fixture.sqlite)).toEqual([
      { peer_id: 'desktop-b', status: 'accepted' },
      { peer_id: 'desktop-c', status: 'pending' }
    ]);
  } finally {
    await fixture.close();
  }
});

it('clears global dirty after every peer obligation terminates', async () => {
  const fixture = await createFixture(9, 'confirmed');
  try {
    await clearConfirmedSyncPushAcksWithDbPort(createBetterSqliteDbPort(fixture.sqlite), {
      incomingAlias: 'incoming', sourcePeerId: 'desktop-b', toStateSeq: 9
    });

    expect(readState(fixture.sqlite)).toEqual({ sync_dirty: 0 });
    expect(readReceipts(fixture.sqlite).every((row) => row.status === 'confirmed')).toBe(true);
  } finally {
    await fixture.close();
  }
});

async function createFixture(incomingStateSeq: number, peerCStatus = 'pending') {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-delivery-'));
  const incomingPath = path.join(tempRoot, 'incoming.db');
  const sqlite = new Database(':memory:');
  const incoming = new Database(incomingPath);
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL, sync_dirty INTEGER NOT NULL
    );
    CREATE TABLE sync_delivery_receipts (
      peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, operation_id TEXT NOT NULL,
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, payload_identity TEXT NOT NULL,
      local_position TEXT, status TEXT NOT NULL, remote_position TEXT, issue_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (peer_id, stream_name, operation_id)
    );
    INSERT INTO sync_object_state VALUES ('node_review', 'node-1', 'android-review-hash', 1);
    INSERT INTO sync_delivery_receipts VALUES
      ('desktop-b', 'state', 'node_review:node-1:4', 'node_review', 'node-1',
       'android-review-hash', '4', 'accepted', '9', NULL, 'now', 'now'),
      ('desktop-c', 'state', 'node_review:node-1:4', 'node_review', 'node-1',
       'android-review-hash', '4', '${peerCStatus}', NULL, NULL, 'now', 'now');
  `);
  incoming.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL, content_hash TEXT NOT NULL
    );
    INSERT INTO sync_object_state VALUES ('node_review', 'node-1', ${incomingStateSeq}, 'desktop-newer-hash');
  `);
  sqlite.exec(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS incoming`);
  return {
    close: async () => {
      sqlite.close();
      incoming.close();
      await fs.rm(tempRoot, { force: true, recursive: true });
    },
    sqlite
  };
}

function readState(sqlite: Database.Database) {
  return sqlite.prepare('SELECT sync_dirty FROM sync_object_state').get();
}

function readReceipts(sqlite: Database.Database) {
  return sqlite.prepare(
    'SELECT peer_id, status FROM sync_delivery_receipts ORDER BY peer_id'
  ).all() as Array<{ peer_id: string; status: string }>;
}
