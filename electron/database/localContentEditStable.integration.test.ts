// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { loadCurrentEditorSyncNode } from '../../lib/core/sync/localContentEditBody.js';
import { applyEditorSyncNodeRecord } from '../../lib/core/sync/localContentEditBranch.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import type { NodeVersionBodyStorage } from '../../lib/core/sync/syncNodeTombstoneVersion.js';
import { loadVerifiedBodyRef, readBodyText } from '../../lib/core/sync/verifiedBody.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const time = '2026-10-07T00:00:00.000Z';
async function fixture(storage: NodeVersionBodyStorage) {
  const host = textDevice();
  const base = textBranch('base', 'Original\ufeff中😀\0', undefined, time);
  await host.receive([base]);
  if (storage === 'chunked') {
    await migrateBodyContentStorage(host.db);
    await migrateBodyContentOwners(host.db, 'desktop');
    host.sqlite.exec('DROP TABLE content_blob_data');
  }
  return { ...host, base, storage };
}

function edit(host: Awaited<ReturnType<typeof fixture>>, baseVersionId: string, versionId: string, content: string) {
  return applyLocalContentEdit(host.db, { baseVersionId, versionId, content, hideTitleHeading: false,
    hostName: 'editor', nodeId: 'topic', title: 'Topic', updatedAt: time }, undefined,
  { bodyStorage: host.storage, enqueueSearchInvalidations: false });
}

it('preserves exact legacy version hashes through three edits with migrated null snapshot fields', async () => {
  const old = await fixture('continuous'), stable = await fixture('chunked');
  try {
    let base = 'base';
    for (const [index, content] of ['', '\ufeff中😀\0', '中😀'.repeat(500_000)].entries()) {
      const version = `edit-${index}`;
      const original = await edit(old, base, version, content);
      const next = await edit(stable, base, version, content);
      expect(next.current.content_hash).toBe(original.current.content_hash);
      expect(next.current.version_id).toBe(version);
      expect(next.current.body_text).toBe(content);
      expect(next.submittedVersionId).toBe(original.submittedVersionId);
      expect(stable.sqlite.prepare('SELECT body_text, json_extract(snapshot_json, \'$.content\') AS content FROM node_sync_versions WHERE version_id = ?')
        .get(version)).toEqual({ body_text: null, content: null });
      base = version;
    }
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('keeps noop and acknowledged retry free of new versions, chunks and proof changes', async () => {
  const host = await fixture('chunked');
  const state = () => ({ versions: host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get(),
    chunks: host.sqlite.prepare('SELECT count(*) FROM content_body_chunks').pluck().get(),
    proof: host.sqlite.prepare('SELECT proof_revision FROM node_version_local_proof_state').pluck().get() });
  try {
    await retainLocalEditBase(host.db, { holdId: 'draft', nodeId: 'topic', versionId: 'base', bodyStorage: 'chunked' });
    const before = state();
    expect((await edit(host, 'base', 'noop', host.base.body_text!)).submittedVersionId).toBe('base');
    expect(state()).toEqual(before);
    const first = await edit(host, 'base', 'edited', 'Replacement');
    const committed = state();
    expect((await edit(host, 'base', 'edited', 'Replacement')).current.version_id).toBe(first.current.version_id);
    expect(state()).toEqual(committed);
    await expect(edit(host, 'base', 'edited', 'Changed')).rejects.toThrow('content_edit_version_mismatch');
    expect(state()).toEqual(committed);
  } finally { host.sqlite.close(); }
});

it('retains both complete concurrent texts without producing a merged text', async () => {
  const host = await fixture('chunked');
  try {
    await retainLocalEditBase(host.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base', bodyStorage: 'chunked' });
    const remote = textBranch('remote', 'Original\nRemote addition', host.base, time);
    await applyEditorSyncNodeRecord(host.db, remote, { bodyStorage: 'chunked', enqueueSearchInvalidations: false });
    const result = await edit(host, 'base', 'local', 'Local addition\nOriginal');
    const alternatives = [];
    for (const alternative of result.current.snapshot.text_alternatives ?? []) {
      alternatives.push(await readBodyText(host.db, (await loadVerifiedBodyRef(host.db, alternative.body_blob_hash))!));
    }
    expect([result.current.body_text, ...alternatives].sort())
      .toEqual(['Original\nRemote addition', 'Local addition\nOriginal'].sort());
    expect(result.current.parent_version_ids).toEqual(['local', 'remote']);
  } finally { host.sqlite.close(); }
});

it('rolls back staged body, submitted hold and current version when final proof write fails', async () => {
  const host = await fixture('chunked');
  try {
    const chunks = host.sqlite.prepare('SELECT count(*) FROM content_body_chunks').pluck().get();
    host.sqlite.exec(`CREATE TRIGGER reject_edit_proof BEFORE UPDATE ON node_version_local_proof_state
      BEGIN SELECT RAISE(ABORT, 'edit_proof_failure'); END`);
    await expect(edit(host, 'base', 'failed', 'New body')).rejects.toThrow('edit_proof_failure');
    expect((await loadCurrentEditorSyncNode(host.db, 'topic', false, 'chunked'))?.version_id).toBe('base');
    expect(host.sqlite.prepare('SELECT count(*) FROM content_body_chunks').pluck().get()).toBe(chunks);
    expect(host.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE version_id = 'failed'").pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_version_local_holds').pluck().get()).toBe(0);
  } finally { host.sqlite.close(); }
});
