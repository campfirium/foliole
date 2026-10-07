// @vitest-environment node
import { expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateBodyContentStorage } from '../database/bodyContentMigration.js';

import type { DbPort, DbRow } from './dbPort.js';
import { loadCurrentEditorSyncNode, loadEditorSyncNodeVersion } from './localContentEditBody.js';
import { hashText } from './syncNodeResolution.js';
import { upsertVerifiedSyncNodeVersion } from './syncNodeVerifiedVersionWrite.js';
import { alternativeForBody } from './topicTextState.js';
import { readBodyText } from './verifiedBody.js';
import { adoptEditorSyncNodeRecord } from './verifiedLocalContentEditRecord.js';

const timestamp = '2026-10-07T00:00:00.000Z';

function boundedEditorReads(db: DbPort, forbiddenHash?: string) {
  const sizes: number[] = [];
  const port: DbPort = { ...db,
    query: async <T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) => {
      if (sql.includes('content_blob_data')) throw new Error('unexpected_continuous_body_read');
      if (sql.includes('content_body_chunks') && forbiddenHash && params?.includes(forbiddenHash)) {
        throw new Error('unexpected_alternative_body_read');
      }
      const rows = await db.query<T>(sql, params);
      for (const row of rows) if (row.data instanceof Uint8Array) sizes.push(row.data.byteLength);
      return rows;
    }
  };
  return { port, sizes };
}

it.each(['', '\ufeff中文🌿\0' + '正文😀'.repeat(320_000)])(
  'reads one editor body identically across explicit storage without changing the version hash', async (body) => {
    const host = textDevice();
    try {
      const base = textBranch('base', 'Base', undefined, timestamp);
      const original = textBranch('edited', body, base, timestamp);
      await host.receive([base, original]);
      const before = (await loadEditorSyncNodeVersion(host.db, 'edited'))!;
      expect(before.body_text).toBe(body);
      expect((await loadCurrentEditorSyncNode(host.db, 'topic'))?.version_id).toBe('edited');
      await migrateBodyContentStorage(host.db);
      await host.db.run('DROP TABLE content_blob_data');
      const stored = host.sqlite.prepare('SELECT snapshot_json, content_hash, body_text FROM node_sync_versions WHERE version_id = ?')
        .get('edited') as { snapshot_json: string; content_hash: string; body_text: null };
      const raw = JSON.parse(stored.snapshot_json) as Record<string, unknown>;
      expect(raw.content).toBeNull();
      expect(stored.body_text).toBeNull();
      const observed = boundedEditorReads(host.db);
      const loaded = (await loadEditorSyncNodeVersion(observed.port, 'edited', false, 'chunked'))!;
      expect(loaded.body_text).toBe(body);
      expect(loaded.snapshot.content).toBe(body);
      expect(Object.keys(loaded.snapshot)).toEqual(Object.keys(raw));
      expect(loaded.content_hash).toBe(before.content_hash);
      expect(loaded.content_hash).toBe(stored.content_hash);
      expect(loaded.ancestor_version_ids).toEqual([]);
      expect((await loadEditorSyncNodeVersion(observed.port, 'edited', true, 'chunked'))?.ancestor_version_ids).toEqual(['base']);
      expect(await loadCurrentEditorSyncNode(observed.port, 'topic', false, 'chunked')).toEqual(loaded);
      expect(observed.sizes.every((size) => size <= 512 * 1024)).toBe(true);
      expect(await loadEditorSyncNodeVersion(host.db, 'missing', false, 'chunked')).toBeNull();
      expect(await loadCurrentEditorSyncNode(host.db, 'missing', false, 'chunked')).toBeNull();
    } finally { host.sqlite.close(); }
  }
);

it('preserves snapshot key positions and content_hash while staging successive editor records', async () => {
  const host = textDevice();
  try {
    await migrateBodyContentStorage(host.db);
    let original = textBranch('base', '\ufeffFirst\0', undefined, timestamp);
    for (let index = 0; index < 3; index++) {
      const logical = { ...original.snapshot, body_blob_hash: null, content: original.body_text!,
        title: `Title ${index}`, updated_at: timestamp };
      original = { ...original, snapshot: logical, content_hash: hashText(JSON.stringify(logical)) };
      const keys = Object.keys(logical);
      const verified = await host.db.transaction((tx) => adoptEditorSyncNodeRecord(tx, original));
      expect(Object.keys(verified.metadata.snapshot)).toEqual(keys);
      expect(verified.metadata.content_hash).toBe(original.content_hash);
      expect((verified.metadata.snapshot as Record<string, unknown>).content).toBeNull();
      expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(index);
      await upsertVerifiedSyncNodeVersion(host.db, verified);
      const restored = (await loadEditorSyncNodeVersion(host.db, original.version_id!, false, 'chunked'))!;
      expect(Object.keys(restored.snapshot)).toEqual(keys);
      expect(restored.body_text).toBe(original.body_text);
      expect(restored.content_hash).toBe(original.content_hash);
      original = { ...restored, version_id: `edit-${index}`, body_text: `\ufeffNext ${index} 中文🌿\0`,
        parent_version_id: restored.version_id!, parent_version_ids: [restored.version_id!],
        ancestor_version_ids: [restored.version_id!] };
    }
  } finally { host.sqlite.close(); }
});

it('loads alternative references without reading their text and refuses a missing reference', async () => {
  const host = textDevice();
  try {
    const other = textBranch('other', 'Alternative'.repeat(350_000), undefined, timestamp);
    const alternative = alternativeForBody(other, timestamp);
    const original = textBranch('version', '\ufeffMain中文🌿\0', undefined, timestamp);
    original.snapshot.text_alternatives = [alternative];
    original.alternative_bodies = [{ hash: alternative.body_blob_hash, text: other.body_text! }];
    await host.receive([original]);
    await migrateBodyContentStorage(host.db);
    const observed = boundedEditorReads(host.db, alternative.body_blob_hash);
    const loaded = (await loadEditorSyncNodeVersion(observed.port, 'version', false, 'chunked'))!;
    expect(loaded.alternative_bodies).toBeUndefined();
    expect(loaded.snapshot.text_alternatives).toEqual([alternative]);
    const staged = await host.db.transaction(() => adoptEditorSyncNodeRecord(observed.port, loaded));
    expect(staged.alternativeBodies.map((ref) => ref.hash)).toEqual([alternative.body_blob_hash]);
    if (staged.body.kind !== 'readable') throw new Error('readable_editor_required');
    expect(await readBodyText(host.db, staged.body.ref)).toBe(original.body_text);
    await host.db.run('DELETE FROM content_bodies WHERE hash = ?', [alternative.body_blob_hash]);
    await expect(loadEditorSyncNodeVersion(observed.port, 'version', false, 'chunked'))
      .rejects.toThrow('text_alternative_body_unavailable');
    await expect(host.db.transaction(() => adoptEditorSyncNodeRecord(observed.port, loaded)))
      .rejects.toThrow('text_alternative_body_unavailable');
  } finally { host.sqlite.close(); }
});

it('refuses retired, unavailable and missing main bodies instead of returning empty content', async () => {
  const host = textDevice();
  try {
    await host.receive([textBranch('version', 'Main', undefined, timestamp)]);
    await migrateBodyContentStorage(host.db);
    for (const state of ['retired', 'unavailable']) {
      await host.db.run('UPDATE node_sync_versions SET body_state = ? WHERE version_id = ?', [state, 'version']);
      await expect(loadEditorSyncNodeVersion(host.db, 'version', false, 'chunked'))
        .rejects.toThrow('sync_node_version_body_unavailable:version');
    }
    await host.db.run("UPDATE node_sync_versions SET body_state = 'readable' WHERE version_id = 'version'");
    await host.db.run('DELETE FROM content_bodies');
    await expect(loadCurrentEditorSyncNode(host.db, 'topic', false, 'chunked'))
      .rejects.toThrow('sync_node_version_body_unavailable:version');
    await expect(adoptEditorSyncNodeRecord(host.db, { ...textBranch('empty', '', undefined, timestamp), body_text: null }))
      .rejects.toThrow('content_edit_body_unavailable');
  } finally { host.sqlite.close(); }
});
