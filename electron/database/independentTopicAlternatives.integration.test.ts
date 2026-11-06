// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { readFramedSyncObjectPayload } from '../../lib/core/sync/framedSyncObjectStatePayload.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { TopicAlternativeRecord } from '../../lib/core/sync/topicAlternativeRecord.js';
import { settleTopicAlternatives, writeTopicAlternative } from '../../lib/core/sync/topicAlternativeStore.js';
import { expireTopicText } from '../../lib/core/sync/topicTextExpiry.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { transferTopicText } from './topicTextRequest.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const host = textDevice(); devices.push(host); return host; }
afterEach(() => devices.splice(0).forEach(host => host.sqlite.close()));

async function conflict(host: ReturnType<typeof textDevice>) {
  const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'Main article with more words', base)]);
  return host.receive([textBranch('other', 'Another complete draft', base)]);
}

async function alternativeFact(host: ReturnType<typeof textDevice>, id: string): Promise<NativeSyncObjectRecord> {
  const [state] = await host.db.query<{ content_hash: string; updated_at: string }>(
    "SELECT content_hash, updated_at FROM sync_object_state WHERE object_type='node_text_alternative' AND object_id=?", [id]);
  return { ...state!, object_id: id, object_type: 'node_text_alternative', deleted_at: null,
    payload_json: await readFramedSyncObjectPayload(host.db, { objectType: 'node_text_alternative', globalId: id }) };
}

it('keeps distinct forks from the same device instead of restoring the retired one-per-device rule', async () => {
  const host = device(); const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'The longest main draft', base)]);
  const b = textBranch('b', 'First idea', base); b.host_name = 'same-device';
  const c = textBranch('c', 'Second idea', base); c.host_name = 'same-device';
  await host.receive([b, c]);
  expect(await host.wholeBodies()).toEqual(new Set(['The longest main draft', 'First idea', 'Second idea']));
});

it.each(['dismissed', 'expired'] as const)('keeps %s alternatives retired through an independent edit and stale replay', async action => {
  const left = device(); const right = device();
  await conflict(left); await transferTopicText(left, right);
  const [entry] = await left.alternatives();
  const stale = await alternativeFact(left, entry!.id);
  const old = await right.current();
  if (action === 'dismissed') await mutateTopicText(left.db, { nodeId: 'topic', alternativeId: entry!.id,
    action, now: new Date().toISOString(), versionId: 'dismiss', hostName: 'left' });
  else await expireTopicText(left.db, 'topic', new Date(Date.parse(entry!.expires_at) + 1).toISOString());
  await applyLocalContentEdit(right.db, { nodeId: 'topic', baseVersionId: old.version_id!,
    baseContent: old.body_text!, versionId: 'edit', content: 'The current article with continued input from the right',
    title: 'Topic', hideTitleHeading: false, hostName: 'right', updatedAt: new Date().toISOString() });
  await transferTopicText(left, right);
  await applySyncObjectsWithDbPort(right.db, [stale]);
  await transferTopicText(right, left);
  expect(await left.alternatives()).toEqual([]);
  expect(await right.alternatives()).toEqual([]);
  expect((await left.current()).body_text).toBe('The current article with continued input from the right');
  expect((await right.current()).version_id).toBe((await left.current()).version_id);
  expect(right.sqlite.prepare('SELECT body_text FROM node_text_alternatives WHERE alternative_id=?').pluck().get(entry!.id)).toBe('');
});

it('adopts a selected alternative without saving the displaced main as a new alternative', async () => {
  const host = device(); await conflict(host);
  const [entry] = await host.alternatives();
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: entry!.id,
    action: 'promoted', now: new Date().toISOString(), versionId: 'adopt', hostName: 'host' });
  expect((await host.current()).body_text).toBe('Another complete draft');
  expect(await host.alternatives()).toEqual([]);
});

it('keeps alternative image demand independent from the main body and releases it on dismissal', async () => {
  const host = device(); const base = textBranch('base', 'Base');
  const hash = '1'.repeat(64); const key = `${hash}.png`;
  await host.receive([base, textBranch('main', 'The main article remains deliberately much longer than the alternative '.repeat(3), base)]);
  const other = textBranch('other', `![image](asset://${key})`, base);
  other.snapshot.resource_references = JSON.stringify([{ storage_key: key, role: 'image', original_name: null }]);
  await host.receive([other]);
  expect((await loadNodeOwnedArticleResourceNeeds(host.db, ['topic'])).needs.map(need => need.storageKey)).toContain(key);
  const [entry] = await host.alternatives();
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: entry!.id,
    action: 'dismissed', now: new Date().toISOString(), versionId: 'dismiss', hostName: 'host' });
  expect((await loadNodeOwnedArticleResourceNeeds(host.db, ['topic'])).needs.map(need => need.storageKey)).not.toContain(key);
});

it('sends a full-size alternative through body chunks rather than an oversized JSON string', async () => {
  const source = device(); const target = device();
  const base = textBranch('large-base', 'Base', undefined, new Date(Date.now() - 120_000).toISOString());
  const text = '\\\n'.repeat(524288);
  const other = textBranch('large-other', text, base, new Date(Date.now() - 60_000).toISOString());
  const main = textBranch('large-main', 'x'.repeat(1048576), base);
  await source.receive([base, main]); await source.receive([other]);
  await transferTopicText(source, target);
  const [entry] = await target.alternatives();
  expect(target.sqlite.prepare('SELECT body_text FROM node_text_alternatives WHERE alternative_id=?').pluck().get(entry!.id)).toBe(text);
});

it('deletes independent alternatives with their node and rejects delayed creation on either peer', async () => {
  const left = device(); const right = device();
  await conflict(left); await transferTopicText(left, right);
  const [entry] = await left.alternatives();
  const stale = await alternativeFact(left, entry!.id);
  left.sqlite.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('host_name', 'left', ?)")
    .run(new Date().toISOString());
  const driver = createBetterSqlite3Driver(left.sqlite);
  left.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
  initializeWorkspaceSearchSidecar({ sqlite: left.sqlite, driver });
  const now = new Date().toISOString();
  driver.execute("UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = 'topic'", [now, now]);
  flushNodeSyncVersionWithDriver(driver, 'topic', 'left', now);
  deleteNodesPermanently(driver, { nodeIds: ['topic'], deletedAt: now });
  await transferTopicText(left, right);
  for (const host of [left, right]) {
    await applySyncObjectsWithDbPort(host.db, [stale]);
    expect(host.sqlite.prepare("SELECT id FROM nodes WHERE id='topic'").get()).toBeUndefined();
    expect(host.sqlite.prepare('SELECT COUNT(*) FROM node_text_alternatives').pluck().get()).toBe(0);
    expect(host.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type='node_text_alternative' AND object_id=?")
      .pluck().get(entry!.id)).toBeTruthy();
  }
});

it('settles independently received choices even when both peers already have the same main version', async () => {
  const left = device(); const right = device();
  await conflict(left); await transferTopicText(left, right);
  const original = left.sqlite.prepare("SELECT * FROM node_text_alternatives WHERE status='available'").get() as TopicAlternativeRecord;
  for (const [host, name] of [[left, 'left'], [right, 'right']] as const) {
    for (let index = 0; index < 3; index++) {
      const body = `${name} ${index}`;
      await writeTopicAlternative(host.db, { ...original, alternative_id: `${name}-${index}`,
        source_version_id: `${name}-${index}`, body_text: body, body_blob_hash: hashTextBody(body),
        created_at: new Date(Date.now() + index * 1000).toISOString() }, true);
    }
    await settleTopicAlternatives(host.db, 'topic', hashTextBody((await host.current()).body_text!), new Date().toISOString());
  }
  const main = (await left.current()).version_id;
  await transferTopicText(left, right); await transferTopicText(right, left);
  for (const host of [left, right]) {
    expect((await host.current()).version_id).toBe(main);
    expect(await host.alternatives()).toHaveLength(3);
    expect(host.sqlite.prepare("SELECT COUNT(*) FROM node_text_alternatives WHERE status='available'").pluck().get()).toBe(3);
  }
  expect((await left.alternatives()).map(entry => entry.id)).toEqual((await right.alternatives()).map(entry => entry.id));
});
