// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { decodeCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncDecode.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const databases: Database.Database[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); });

it('restores whole-body attachments into a fresh companion SQLite library through its framed decoder', async () => {
  const desktop = textDevice(); databases.push(desktop.sqlite);
  const base = textBranch('base', 'Base');
  await desktop.receive([base, textBranch('a', 'Main longest body', base)]);
  const whole = await desktop.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  const projection = projectFramedSyncNodeRecord(whole);
  const fact = projection.manifest.facts[0]!;
  const data = new Map((projection.alternativeBodyBlobs ?? []).map((entry) => [bytesToHex(entry.blob.sha256), entry.data]));
  const mainHash = fact.blobs.find((blob) => !data.has(bytesToHex(blob.sha256)))!;
  data.set(bytesToHex(mainHash.sha256), projection.bodyBlob);
  const decoded = decodeCompanionFramedSyncTransfer({ facts: [fact], resourceRows: [], resourceStorageKeys: [],
    bodyRows: fact.blobs.map((blob) => ({ sha256: blob.sha256, byte_length: blob.byteLength,
      role: blob.role, required: 1, data: data.get(bytesToHex(blob.sha256))! })) });
  const sqlite = new Database(':memory:'); databases.push(sqlite);
  const companion = createBetterSqliteDbPort(sqlite);
  await companion.transaction((tx) => createCompanionDatabase(tx, 76));
  await applyConvergentSyncNodesWithDbPort(companion, decoded.nodes);
  const restored = await loadCurrentSyncNodeRecord(companion, 'topic');
  expect(restored?.version_id).toBe(whole.version_id);
  expect(wholeBodies(restored!)).toEqual(new Set(['Main longest body', 'B', 'C']));
  expect(restored?.snapshot.text_alternatives).toEqual(whole.snapshot.text_alternatives);
});
