// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function readBaseline(databasePath: string, bindingId: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare('SELECT value FROM sync_group_metadata WHERE key = ?')
      .pluck().get(`webdav_relay_baseline:${bindingId}`);
  } finally { db.close(); }
}

it.skipIf(process.platform !== 'darwin').each(['initiator', 'responder'] as const)(
  'makes authenticated WebDAV ready after the Mac completes LAN sync as %s',
  async role => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    try {
      const { left, right, leftSnapshot, rightSnapshot } = fixture;
      const groupId = 't326-group';
      const binding = { id: randomUUID(), group_id: groupId,
        desktop_device_id: leftSnapshot.deviceId, phone_device_id: rightSnapshot.deviceId,
        directory_url: 'https://dav.example.test/relay/', delivered: true, credential_version: 1 };
      const db = new Database(leftSnapshot.databasePath);
      try {
        // Start from the state persisted after the phone's credential installation receipt.
        db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
          .run(`webdav_relay_directory:${groupId}:${leftSnapshot.deviceId}:binding`,
            JSON.stringify(binding), new Date().toISOString());
      } finally { db.close(); }
      expect(readBaseline(leftSnapshot.databasePath, binding.id)).toBeUndefined();
      const result = role === 'initiator' ? await reconnectFixturePeer(left, rightSnapshot)
        : await reconnectFixturePeer(right, leftSnapshot);
      expect(result).toMatchObject({ complete: true });
      await fixture.restartLeft();
      const baseline = readBaseline(leftSnapshot.databasePath, binding.id);
      expect(typeof baseline).toBe('string');
      expect(JSON.parse(String(baseline))).toMatchObject({
        localEpoch: `${leftSnapshot.deviceId}-epoch`, peerEpoch: `${rightSnapshot.deviceId}-epoch`
      });
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
);
