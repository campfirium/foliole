// @vitest-environment node

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import {
  currentDeliveryStatusCountsByPeerFingerprint, pendingDeliveryCountsByPeerFingerprint
} from './android-pair-sync-peer-delivery-readiness.mjs';

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

it('counts unresolved current objects instead of historical pending receipt rows', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE sync_group_local_state (singleton_id INTEGER, group_id TEXT, local_device_id TEXT);
    CREATE TABLE sync_group_members (group_id TEXT, device_id TEXT, state TEXT, joined_at TEXT);
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, current_version_id TEXT, content_hash TEXT,
      updated_at TEXT, sync_dirty INTEGER
    );
    CREATE TABLE sync_delivery_receipts (
      peer_id TEXT, object_type TEXT, object_id TEXT, payload_identity TEXT, status TEXT
    );
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'android');
    INSERT INTO sync_group_members VALUES
      ('group-1', 'android', 'active', '2026-08-14T00:00:00.000Z'),
      ('group-1', 'Maci', 'active', '2026-08-14T00:00:00.000Z'),
      ('group-1', 'offline-peer', 'active', '2026-08-14T00:00:00.000Z');
    INSERT INTO sync_object_state VALUES (
      'node_text_alternative', 'alternative-1', NULL, 'current-hash',
      '2026-08-15T00:00:00.000Z', 1
    );
  `);
  const insert = database.prepare(
    `INSERT INTO sync_delivery_receipts VALUES (?, 'node_text_alternative',
      'alternative-1', 'current-hash', ?)`
  );
  for (let index = 0; index < 29; index += 1) insert.run('Maci', 'pending');
  insert.run('Maci', 'accepted');
  insert.run('offline-peer', 'pending');

  expect(pendingDeliveryCountsByPeerFingerprint(database)).toEqual({
    [fingerprint('offline-peer')]: 1
  });
  expect(currentDeliveryStatusCountsByPeerFingerprint(database)).toEqual({
    [fingerprint('Maci')]: { accepted: 1, pending: 29 },
    [fingerprint('offline-peer')]: { pending: 1 }
  });
  database.close();
});
