// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const now = '2026-10-06T23:00:00.000Z';
const day = '2026-10-06';
const timeSource = '11111111-1111-4111-8111-111111111111';
const cases: { type: NativeSyncObjectRecord['object_type']; id: string; payload: Record<string, string | number | boolean | null>;
  query: string; expected: unknown }[] = [
  { type: 'external_folder', id: 'folder', payload: { attachment_mode: 'document_relative_first_then_fixed_root',
    excluded_dirs_json: '[".git"]', host_name: 'original-host', host_platform: 'darwin', id: 'folder', source_ref: 'external:folder' },
    query: "SELECT excluded_dirs_json FROM external_search_folders WHERE id = 'folder'", expected: '[".git"]' },
  { type: 'import_source', id: 'source', payload: { first_imported_at: now, last_imported_at: now,
    last_content_fingerprint: 'original', provider: 'manual', source_kind: 'markdown', source_locator: '/original.md', source_name: 'Original.md' },
    query: "SELECT source_name FROM import_sources WHERE source_fingerprint = 'source'", expected: 'Original.md' },
  { type: 'node_open_state', id: 'topic', payload: { node_id: 'topic', last_opened_at: now },
    query: "SELECT last_opened_at FROM node_open_state WHERE node_id = 'topic'", expected: now },
  { type: 'node_review', id: 'topic', payload: { node_id: 'topic', difficulty: 3.4, due: now,
    elapsed_days: 1, lapses: 0, last_review_at: now, reps: 4, scheduled_days: 3, stability: 2.8, state: 2 },
    query: "SELECT reps FROM node_review WHERE node_id = 'topic'", expected: 4 },
  { type: 'node_text_alternative', id: 'alternative', payload: { alternative_id: 'alternative', node_id: 'topic',
    source_host_name: 'original-host', body_text: 'Original alternative body', created_at: now, updated_at: now, status: 'available' },
    query: "SELECT body_text FROM node_text_alternatives WHERE alternative_id = 'alternative'", expected: 'Original alternative body' },
  { type: 'pdf_page_text', id: 'original-pdf:1', payload: { attachment_id: 'original-pdf', page: 1,
    text: 'Original page text', page_width: 600, page_height: 800 },
    query: "SELECT text FROM pdf_page_text WHERE attachment_id = 'original-pdf' AND page = 1", expected: 'Original page text' },
  { type: 'watched_folder', id: 'watched', payload: { binding_id: 'watched', host_name: 'original-host', host_platform: 'darwin',
    source_ref: 'watched:original', owner_device_identity_key: null, reported_path: '/Original', connection_status: 'needs-folder',
    action_mode: 'keep', highlight_mode: 'merged', created_at: now, updated_at: now },
    query: "SELECT reported_path FROM watched_folder_bindings WHERE binding_id = 'watched'", expected: '/Original' },
  { type: 'topic_daily_count', id: `${day}:topic`, payload: { day_key: day, node_id: 'topic' },
    query: "SELECT node_id FROM topic_daily_count_entries WHERE day_key = '2026-10-06'", expected: 'topic' },
  { type: 'foreground_daily_time', id: `${timeSource}:${day}`, payload: { day_key: day, source_id: timeSource, duration_ms: 123456 },
    query: "SELECT duration_ms FROM foreground_daily_time WHERE source_id = '11111111-1111-4111-8111-111111111111'", expected: 123456 }
];

it.each(cases)('discovers and persists the original $type payload through a normal round', async (sample) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Original body', nodeId: 'topic', title: 'Original' });
    const source = new Database(fixture.leftSnapshot.databasePath);
    const payload = { ...sample.payload };
    try {
      if (sample.type === 'node_text_alternative') {
        const head = source.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get();
        if (typeof head !== 'string') throw new Error('original_version_missing');
        payload.source_version_id = head;
      }
      await applySyncObjectInTransaction(createBetterSqliteDbPort(source), { object_type: sample.type,
        object_id: sample.id, content_hash: sample.type === 'node_text_alternative' ? createHash('sha256').update(JSON.stringify(payload)).digest('hex')
          : computeSyncContentHash(sample.type, payload),
        deleted_at: null, payload_json: JSON.stringify(payload), updated_at: now });
      expect(source.prepare(sample.query).pluck().get()).toEqual(sample.expected);
    } finally { source.close(); }
    const original = (await readFixtureInventory(fixture.left))
      .find((entry) => entry.objectType === sample.type && entry.globalId === sample.id);
    expect(original).toBeDefined();
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const target = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try { expect(target.prepare(sample.query).pluck().get()).toEqual(sample.expected); }
    finally { target.close(); }
    expect((await readFixtureInventory(fixture.right))
      .find((entry) => entry.objectType === sample.type && entry.globalId === sample.id)).toEqual(original);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
