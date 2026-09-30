import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from '../../lib/core/database/syncPackProgressSchemaStatements.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { handleCompanionAttachmentCheckpoint } from '../../src/shared/platform/companion/runtime/companionAttachmentCheckpoint.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

const binding = vi.hoisted(() => ({ port: null as DbPort | null,
  writer: vi.fn(async <T>(task: (db: DbPort) => Promise<T>) => task(binding.port!)) }));
const handleCheckpoint = (payload: Record<string, unknown>) => handleCompanionAttachmentCheckpoint({
  databasePath: '/fixture/library.db',
  runWriter: <T>(task: (db: DbPort) => Promise<T>) => binding.writer(task) as Promise<T>
}, payload);

let db: Database.Database | null = null;
afterEach(() => { db?.close(); db = null; binding.writer.mockClear(); });

it('persists native confirmations through the bound shared writer and rejects another library', async () => {
  db = new Database(':memory:');
  db.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
  binding.port = createBetterSqliteDbPort(db);
  const identity = { database_path: '/fixture/library.db', temporary_path: '/attachments/hash.unverified',
    content_hash: 'a'.repeat(64), total_bytes: 3 * 1024 * 1024 };
  await handleCheckpoint({ ...identity, action: 'save', confirmed_bytes: 2 * 1024 * 1024 });
  expect(await handleCheckpoint({ ...identity, action: 'load' }))
    .toEqual({ confirmed_bytes: 2 * 1024 * 1024 });
  expect(() => handleCheckpoint({ ...identity, database_path: '/other/library.db', action: 'clear' }))
    .toThrow('attachment_checkpoint_identity_invalid');
  await expect(handleCheckpoint({ ...identity, action: 'save', confirmed_bytes: 4 * 1024 * 1024 }))
    .rejects.toThrow('attachment_checkpoint_offset_invalid');
  expect(await handleCheckpoint({ ...identity, action: 'load' }))
    .toEqual({ confirmed_bytes: 2 * 1024 * 1024 });
  const pages = db.pragma('page_count', { simple: true });
  db.pragma(`max_page_count = ${pages}`);
  await expect(handleCheckpoint({ ...identity, action: 'save', content_hash: 'b'.repeat(64),
    temporary_path: `/${'long-path'.repeat(2048)}.unverified`, confirmed_bytes: 1024 * 1024 }))
    .rejects.toThrow('attachment_checkpoint_disk_full');
  expect(await handleCheckpoint({ ...identity, action: 'load' }))
    .toEqual({ confirmed_bytes: 2 * 1024 * 1024 });
  await handleCheckpoint({ ...identity, action: 'clear' });
  expect(await handleCheckpoint({ ...identity, action: 'load' })).toEqual({ confirmed_bytes: 0 });
  expect(binding.writer).toHaveBeenCalledTimes(8);
});
