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
    CREATE TABLE sync_group_local_state (
      singleton_id INTEGER, group_id TEXT, local_device_identity_key TEXT
    );
    CREATE TABLE sync_group_devices (
      group_id TEXT, device_identity_key TEXT, state TEXT, joined_at TEXT
    );
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, current_version_id TEXT, content_hash TEXT,
      updated_at TEXT, sync_dirty INTEGER
    );
    CREATE TABLE sync_delivery_receipts (
      peer_id TEXT, object_type TEXT, object_id TEXT, payload_identity TEXT, status TEXT
    );
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'android-device');
    INSERT INTO sync_group_devices VALUES
      ('group-1', 'android-device', 'active', '2026-08-14T00:00:00.000Z'),
      ('group-1', 'mac-device', 'active', '2026-08-14T00:00:00.000Z'),
      ('group-1', 'offline-device', 'active', '2026-08-14T00:00:00.000Z');
    INSERT INTO sync_object_state VALUES (
      'node_text_alternative', 'alternative-1', NULL, 'current-hash',
      '2026-08-15T00:00:00.000Z', 1
    );
  `);
  const insert = database.prepare(
    `INSERT INTO sync_delivery_receipts VALUES (?, 'node_text_alternative',
      'alternative-1', 'current-hash', ?)`
  );
  for (let index = 0; index < 29; index += 1) insert.run('mac-device', 'pending');
  insert.run('mac-device', 'accepted');
  insert.run('offline-device', 'pending');

  expect(pendingDeliveryCountsByPeerFingerprint(database)).toEqual({
    [fingerprint('offline-device')]: 1
  });
  expect(currentDeliveryStatusCountsByPeerFingerprint(database)).toEqual({
    [fingerprint('mac-device')]: { accepted: 1, pending: 29 },
    [fingerprint('offline-device')]: { pending: 1 }
  });
  database.close();
});
