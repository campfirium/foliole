// @vitest-environment node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.ts';
import { textBranch } from '../../electron/database/topicTextState.testSupport.ts';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.ts';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.ts';
import { assertSyncFromZeroDatasetFacts, syncFromZeroDatasetDigest } from '../sync-group/sync-from-zero-contract.mjs';
import { inspectSyncGroupRecoveryDatabase } from './windows-sync-group-recovery-inspect.mjs';

it('reads the current node-owned dataset and verifies complete, corrupt and absent asset files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-group-inspect-'));
  fs.mkdirSync(path.join(root, 'Data')); fs.mkdirSync(path.join(root, 'Assets'));
  const file = path.join(root, 'Data', 'foliole.db');
  const db = new Database(file);
  try {
    initializeDatabaseSchema(db);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments', 'sync_peer_cursors')").all()).toEqual([]);
    const resources = Array.from({ length: 65 }, (_, index) => {
      const bytes = Buffer.from(`Resource ${index}`);
      const id = createHash('sha256').update(bytes).digest('hex');
      const file = path.join(root, 'Assets', `${id}.png`);
      fs.writeFileSync(file, bytes); return { bytes, file, id };
    });
    const nodeIds = [];
    for (let index = 0; index < 40; index++) {
      const id = `sync-from-zero-a-${String(index).padStart(3, '0')}`;
      const record = textBranch(`${id}-version`, `Original body ${index}中文😀`);
      record.object_id = id; record.snapshot.id = id;
      await applySyncNodesWithDbPort(createBetterSqliteDbPort(db), [record]);
      const references = resources.filter((_resource, offset) => offset % 40 === index)
        .map(resource => ({ storage_key: `${resource.id}.png`, role: 'image', original_name: null }));
      db.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?').run(JSON.stringify(references), id);
      nodeIds.push(id);
    }
    const complete = inspectSyncGroupRecoveryDatabase(file);
    expect(assertSyncFromZeroDatasetFacts(complete)).toBe(complete);
    expect(complete).toMatchObject({ attachmentCount: 65, missingAttachmentCount: 0, integrity: 'ok' });
    expect(complete.datasetDigest).toBe(syncFromZeroDatasetDigest({ nodeIds,
      attachmentIds: resources.map(resource => resource.id), contentHashes: complete.datasetContentHashes }));
    fs.writeFileSync(resources[0].file, 'corrupt'); fs.unlinkSync(resources[1].file);
    const incomplete = inspectSyncGroupRecoveryDatabase(file);
    expect(incomplete).toMatchObject({ attachmentCount: 65, missingAttachmentCount: 2, datasetCachedAttachmentCount: 63 });
    expect(incomplete.datasetDigest).toBe(complete.datasetDigest);
    expect(() => assertSyncFromZeroDatasetFacts(incomplete)).toThrow('dataset is incomplete');
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
