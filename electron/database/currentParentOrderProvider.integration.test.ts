// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash } from '../../lib/core/sync/currentParentOrder.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { restoreFramedSyncNodeChildFact } from '../../lib/core/sync/framedSyncNodeChildFact.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

it('preserves original current sources with quoted and Unicode identities through a current request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-current-order-provider-'));
  const sourcePath = path.join(root, 'source.db');
  const source = new Database(sourcePath);
  try {
    initializeDatabaseSchema(source);
    const port = createBetterSqliteDbPort(source);
    const parent = textBranch('parent-version', 'Parent');
    parent.object_id = 'parent'; parent.snapshot.id = 'parent';
    await applySyncNodesWithDbPort(port, [parent]);
    const sources = [{ authorId: 'a"中', counter: 4, childIds: ['node-1', 'late\\child'] },
      { authorId: '😀', counter: 2, childIds: ['late\\child', 'node-1'] }];
    source.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)').run('parent', '[]', 'now');
    for (const value of sources) source.prepare('INSERT INTO parent_order_sources VALUES (?, ?, ?, ?)')
      .run('parent', value.authorId, value.counter, JSON.stringify(value.childIds));
    upsertSyncObjectState(createBetterSqlite3Driver(source), { objectType: 'parent_child_order',
      objectId: 'parent', contentHash: currentParentOrderHash('parent', sources),
      lastModifiedByHostName: 'android-b', updatedAt: 'now' });
    const entry = await readFramedSyncInventoryEntry(port, { objectType: 'node', globalId: 'parent' });
    expect(entry).not.toBeNull();
    const [difference] = compareFramedSyncInventories({ local: [entry!], remote: [] });
    await withRequestSyncFiles(createDesktopFramedSyncFiles(path.join(root, 'request')), async request => {
      await writeRequestSyncSnapshot(port, difference!, request);
      const facts = [];
      for await (const fact of request.readFacts()) if (fact.kind === 1) facts.push(fact);
      expect(facts).toHaveLength(1);
      const row = restoreFramedSyncNodeChildFact(facts[0]!);
      const payload = JSON.parse(row.payload_json!);
      expect(JSON.parse(payload.sources_json)).toEqual(sources);
      expect(currentParentOrderHash(payload.parent_id, JSON.parse(payload.sources_json))).toBe(row.content_hash);
    });
  } finally { source.close(); fs.rmSync(root, { force: true, recursive: true }); }
});
