// @vitest-environment node
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';
import { loadVerifiedBodyRef, readBodyText } from '../../lib/core/sync/verifiedBody.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { selectDesktopFramedSyncVerifiedOutboundNodeFacts } from './desktopFramedSyncVerifiedOutboundNodeFacts.js';
import { migrate, oldProjections, timestamp, tombstone } from './desktopFramedSyncVerifiedOutboundNodeFacts.testSupport.js';

it.each(['matching', 'standalone', 'mismatch'] as const)('preserves %s tombstone facts and original proof owner', async (mode) => {
  const host = textDevice();
  try {
    const body = '\ufeffOriginal中文😀\0' + '中😀'.repeat(550_000);
    const record = await tombstone(host, body, mode);
    const old = await oldProjections(host, ['deleted']);
    const loaded = (await loadRetainedSyncNodeVersionRecords(host.db, ['deleted'])).get('deleted')!;
    expect(loaded.body_text).toBe(mode === 'matching' ? body : '');
    await migrate(host);
    const before = host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
    expect(await host.db.transaction((tx) => selectDesktopFramedSyncVerifiedOutboundNodeFacts(tx, ['deleted'], 'topic'))).toEqual(old);
    expect(host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(before);
    const owner = host.sqlite.prepare('SELECT inline_body_hash FROM node_sync_tombstones').pluck().get() as string;
    expect(await readBodyText(host.db, (await loadVerifiedBodyRef(host.db, owner))!)).toBe(body);
    expect(record.content_hash).toBe((before[0] as { content_hash: string }).content_hash);
    expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(mode === 'standalone' ? 0 : 1);
  } finally { host.sqlite.close(); }
});

it('keeps original empty matching tombstone distinct from standalone empty transport', async () => {
  for (const mode of ['matching', 'standalone'] as const) {
    const host = textDevice();
    try {
      await tombstone(host, '', mode);
      const old = await oldProjections(host, ['deleted']);
      await migrate(host);
      expect(await selectDesktopFramedSyncVerifiedOutboundNodeFacts(host.db, ['deleted'], 'topic')).toEqual(old);
      expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(mode === 'matching' ? 1 : 0);
    } finally { host.sqlite.close(); }
  }
});

it('retains tombstone alternatives and rejects missing original alternative references', async () => {
  const host = textDevice();
  try {
    const record = await tombstone(host, 'Original', 'standalone');
    const alternative = textBranch('alternative', 'Alternative中文', undefined, timestamp);
    const entry = alternativeForBody(alternative, timestamp);
    record.snapshot.text_alternatives = [entry];
    await upsertTextBodyBlob(host.db, alternative.body_text!, timestamp, entry.body_blob_hash);
    await applyRemoteNodeTombstone(host.db, record, false);
    const old = await oldProjections(host, ['deleted']);
    await migrate(host);
    expect(await selectDesktopFramedSyncVerifiedOutboundNodeFacts(host.db, ['deleted'], 'topic')).toEqual(old);
    host.sqlite.exec('DROP TRIGGER content_body_chunks_immutable_delete');
    host.sqlite.prepare('DELETE FROM content_bodies WHERE hash = ?').run(entry.body_blob_hash);
    await expect(selectDesktopFramedSyncVerifiedOutboundNodeFacts(host.db, ['deleted'], 'topic'))
      .rejects.toThrow(`text_alternative_body_unavailable:${entry.id}`);
  } finally { host.sqlite.close(); }
});

it('preserves ordinary snapshot fallback, retired ancestry and requested parent ordering', async () => {
  const host = textDevice();
  try {
    const parent = textBranch('parent', 'Parent original', undefined, timestamp);
    const child = textBranch('child', 'Child original', parent, timestamp);
    await upsertRemoteVersion(host.db, parent);
    await upsertRemoteVersion(host.db, child);
    host.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL WHERE version_id = 'child'").run();
    host.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL) WHERE version_id = 'parent'").run();
    const old = await oldProjections(host, ['child', 'parent']);
    await migrate(host);
    expect(await selectDesktopFramedSyncVerifiedOutboundNodeFacts(host.db, ['child', 'parent'], 'topic')).toEqual(old);
    host.sqlite.prepare("UPDATE node_sync_versions SET body_state = 'unavailable', body_blob_hash = ? WHERE version_id = 'parent'").run(hashTextBody('missing'));
    await expect(selectDesktopFramedSyncVerifiedOutboundNodeFacts(host.db, ['parent'], 'topic')).rejects.toThrow('sync_node_version_body_unavailable:parent');
  } finally { host.sqlite.close(); }
});
