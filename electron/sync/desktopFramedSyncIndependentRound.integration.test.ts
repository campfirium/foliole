// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('converges original order facts and current order through a normal production peer round', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Body', nodeId: 'independent-order', title: 'Ordered' });
    await fixture.left.invoke('round', { input: { kind: 'reconcile',
      peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: fixture.rightSnapshot.origin } });
    const read = (file: string) => {
      const db = new Database(file, { readonly: true });
      try {
        return { orders: db.prepare('SELECT * FROM parent_child_order ORDER BY parent_id').all(),
          facts: db.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all(),
          states: db.prepare("SELECT object_id, content_hash, current_version_id FROM sync_object_state WHERE object_type = 'parent_child_order' ORDER BY object_id").all() };
      } finally { db.close(); }
    };
    const source = read(fixture.leftSnapshot.databasePath);
    const received = read(fixture.rightSnapshot.databasePath);
    const identities = (facts: unknown[]) => facts.map((fact) => {
      const { child_ids_json: body, ...identity } = fact as Record<string, unknown>;
      void body;
      return identity;
    });
    expect(identities(received.facts)).toEqual(identities(source.facts));
    expect(received.states).toEqual(source.states);
    expect(received.orders.map((row) => ({ parent_id: (row as { parent_id: string }).parent_id,
      child_ids_json: (row as { child_ids_json: string }).child_ids_json })))
      .toEqual(source.orders.map((row) => ({ parent_id: (row as { parent_id: string }).parent_id,
        child_ids_json: (row as { child_ids_json: string }).child_ids_json })));
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
