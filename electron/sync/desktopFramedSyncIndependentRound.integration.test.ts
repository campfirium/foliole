// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadDerivedNodeOrder } from '../../lib/core/database/parentChildOrder.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('converges original order facts and current order through a normal production peer round', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ content: 'Body', nodeId: 'independent-order', title: 'Ordered' });
    await fixture.left.invoke('round', { input: { kind: 'request_reconcile',
      peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch` },
      peerOrigin: fixture.rightSnapshot.origin } });
    const read = (file: string) => {
      const db = new Database(file, { readonly: true });
      try {
        return { orders: loadDerivedNodeOrder(createBetterSqlite3Driver(db)),
          facts: db.prepare('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id').all(),
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
    expect(received.orders).toEqual(source.orders);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
});
