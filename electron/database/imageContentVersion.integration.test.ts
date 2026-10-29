// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import * as bodyHashing from '../../lib/core/database/textBodyHash.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import * as snapshotHashing from '../../lib/core/sync/syncNodeResolution.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach(value => value.sqlite.close()); });
const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Original.png', role: 'image' as const };
const now = '2026-10-17T10:00:00.000Z';

it('keeps metadata-only changes out of text choices when an offline peer edits the body', async () => {
  const a = device(); const b = device();
  const base = textBranch('base', 'Original text', undefined, '2026-10-17T09:00:00.000Z');
  await a.receive([base]); await b.receive([base]);
  a.sqlite.prepare("UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = 'topic'").run(JSON.stringify([image]));
  flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(a.sqlite), 'topic', 'a', now);
  const metadata = await a.current();
  expect(metadata.snapshot.text_selection).toEqual(base.snapshot.text_selection);
  await applyLocalContentEdit(b.db, { nodeId: 'topic', baseVersionId: 'base', versionId: 'edit',
    content: 'Edited text', title: 'Topic', hideTitleHeading: false, hostName: 'b', updatedAt: now });
  const edited = await b.current();
  const left = await a.receive([edited]); const right = await b.receive([metadata]);
  expect(left.body_text).toBe('Edited text');
  expect(left.snapshot.text_alternatives).toEqual([]);
  expect(right.version_id).toBe(left.version_id);
});

it('commits names with content and rejects reuse of a version id with a different image payload', async () => {
  const a = device(); const b = device();
  const base = textBranch('base', 'Original', undefined, '2026-10-17T09:00:00.000Z');
  await a.receive([base]); await b.receive([base]);
  await retainLocalEditBase(a.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  const input = { nodeId: 'topic', baseVersionId: 'base', versionId: 'edit', content: `![image](asset://${image.storage_key})`,
    title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now, newImageReferences: [image] };
  await applyLocalContentEdit(a.db, input);
  const saved = await a.current();
  expect(JSON.parse(saved.snapshot.resource_references!)).toEqual([image]);
  expect((await b.receive([saved])).snapshot.resource_references).toBe(saved.snapshot.resource_references);
  expect((await applyLocalContentEdit(a.db, input)).current.version_id).toBe(saved.version_id);
  await expect(applyLocalContentEdit(a.db, { ...input,
    newImageReferences: [{ ...image, original_name: 'Different.png' }] })).rejects.toThrow('content_edit_version_mismatch');
});

it('removes only baseline image differences and preserves unreferenced and concurrent resources without reviving a PDF', async () => {
  const a = device(); const b = device();
  const orphan = { ...image, storage_key: `${'c'.repeat(64)}.png`, original_name: 'Legacy.png' };
  const concurrent = { ...image, storage_key: `${'d'.repeat(64)}.png`, original_name: 'Concurrent.png' };
  const pdf = { ...image, storage_key: `${'e'.repeat(64)}.pdf`, original_name: 'Reference.pdf', role: 'reference' as const };
  const body = `Before ![image](asset://${image.storage_key})`;
  const base = textBranch('base', body);
  base.snapshot.resource_references = JSON.stringify([image, orphan, pdf]);
  await a.receive([base]); await b.receive([base]);
  await retainLocalEditBase(a.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  a.sqlite.prepare("UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = 'topic'").run(JSON.stringify([image, orphan, concurrent]));
  flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(a.sqlite), 'topic', 'a', now);
  const metadata = await a.current();
  await b.receive([metadata]);
  await applyLocalContentEdit(a.db, { nodeId: 'topic', baseContent: body, baseVersionId: 'base', versionId: 'remove-image',
    content: 'After', title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  const result = await a.current();
  expect(JSON.parse(result.snapshot.resource_references!)).toEqual([orphan, concurrent]);
  expect(result.snapshot.text_alternatives).toEqual([]);
  const remote = await b.receive([result]);
  expect(JSON.parse(remote.snapshot.resource_references!)).toEqual([orphan, concurrent]);
  expect((await a.receive([remote])).version_id).toBe(result.version_id);
});

it('protects an image name needed by a retained alternative and can promote it later', async () => {
  const a = device(); const b = device();
  const body = `![image](asset://${image.storage_key})`;
  const base = textBranch('base', body);
  base.snapshot.resource_references = JSON.stringify([image]);
  await a.receive([base]); await b.receive([base]);
  for (const [host, id] of [[a, 'left'], [b, 'right']] as const) {
    await applyLocalContentEdit(host.db, { nodeId: 'topic', baseVersionId: 'base', versionId: id,
      content: `${body}\n${id}`, title: 'Topic', hideTitleHeading: false, hostName: id, updatedAt: now });
  }
  const merged = await a.receive([await b.current()]);
  expect(merged.snapshot.text_alternatives).toHaveLength(1);
  await applyLocalContentEdit(a.db, { nodeId: 'topic', baseVersionId: merged.version_id!, versionId: 'remove-main',
    content: 'No main image', title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  const result = await a.current();
  expect(JSON.parse(result.snapshot.resource_references!)).toContainEqual(image);
  const { mutateTopicText } = await import('../../lib/core/sync/topicTextMutation.js');
  await mutateTopicText(a.db, { nodeId: 'topic', alternativeId: result.snapshot.text_alternatives![0]!.id,
    action: 'promoted', versionId: 'restore-image', hostName: 'a', now });
  const restored = await a.current();
  expect(restored.body_text).toContain(body);
  expect(JSON.parse(restored.snapshot.resource_references!)).toContainEqual(image);
});

it('keeps the complete input retryable after a transaction failure and does not create duplicate versions', async () => {
  const a = device();
  await a.receive([textBranch('base', 'Base')]);
  const input = { nodeId: 'topic', baseVersionId: 'base', versionId: 'retry', content: `![image](asset://${image.storage_key})`,
    title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now, newImageReferences: [image] };
  a.sqlite.exec("CREATE TRIGGER fail_edit BEFORE INSERT ON node_sync_versions WHEN new.version_id = 'retry' BEGIN SELECT RAISE(ABORT, 'injected_save_failure'); END");
  await expect(applyLocalContentEdit(a.db, input)).rejects.toThrow('injected_save_failure');
  expect((await a.current()).version_id).toBe('base');
  a.sqlite.exec('DROP TRIGGER fail_edit');
  await applyLocalContentEdit(a.db, input);
  const result = await a.current();
  expect(JSON.parse(result.snapshot.resource_references!)).toEqual([image]);
  expect((await applyLocalContentEdit(a.db, input)).current.version_id).toBe('retry');
  expect(a.sqlite.prepare("SELECT count(*) FROM node_sync_versions WHERE object_id = 'topic'").pluck().get()).toBe(2);
});

it('preserves both branch image names through merging and explicit promotion', async () => {
  const a = device(); const b = device(); const base = textBranch('base', 'Base');
  await a.receive([base]); await b.receive([base]);
  const second = { ...image, storage_key: `${'b'.repeat(64)}.png`, original_name: 'Second.png' };
  for (const [host, id, reference] of [[a, 'left', image], [b, 'right', second]] as const) {
    await applyLocalContentEdit(host.db, { nodeId: 'topic', baseVersionId: 'base', versionId: id,
      content: `![${id}](asset://${reference.storage_key})`, title: 'Topic', hideTitleHeading: false,
      hostName: id, updatedAt: now, newImageReferences: [reference] });
  }
  const left = await a.current(); const right = await b.current();
  const mergedA = await a.receive([right]); const mergedB = await b.receive([left]);
  const settledA = await a.receive([mergedB]);
  const settledB = await b.receive([mergedA]);
  expect((await a.receive([settledB])).version_id).toBe((await b.receive([settledA])).version_id);
  expect(JSON.parse(mergedA.snapshot.resource_references!)).toEqual([image, second]);
  const { mutateTopicText } = await import('../../lib/core/sync/topicTextMutation.js');
  await mutateTopicText(a.db, { nodeId: 'topic', alternativeId: (await a.current()).snapshot.text_alternatives![0]!.id,
    action: 'promoted', versionId: 'promote-image', hostName: 'a', now });
  expect(JSON.parse((await a.current()).snapshot.resource_references!)).toEqual([image, second]);
});

it('keeps old metadata branches conservative and preserves an intentional A to B to A choice', async () => {
  const a = device(); const base = textBranch('base', 'A');
  await a.receive([base]);
  const oldMetadata = textBranch('old-metadata', 'A', base);
  oldMetadata.snapshot.resource_references = JSON.stringify([image]);
  await a.receive([oldMetadata]);
  const changed = textBranch('other-edit', 'B', base);
  const merged = await a.receive([changed]);
  expect(new Set([merged.body_text, ...merged.alternative_bodies!.map(body => body.text)])).toEqual(new Set(['A', 'B']));
  await applyLocalContentEdit(a.db, { nodeId: 'topic', baseVersionId: merged.version_id!, versionId: 'to-b',
    content: 'B again', title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  const middle = await a.current();
  await applyLocalContentEdit(a.db, { nodeId: 'topic', baseVersionId: middle.version_id!, versionId: 'back-a',
    content: 'A', title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  expect((await a.current()).snapshot.text_selection?.version_id).toBe('back-a');
  expect((await a.current()).body_text).toBe('A');
});

it('records an intentional A to B to A edit as a fresh selection and inherits it for metadata', async () => {
  const a = device(); await a.receive([textBranch('base', 'A')]);
  for (const [versionId, baseVersionId, content] of [['b', 'base', 'B'], ['a-again', 'b', 'A']]) {
    await applyLocalContentEdit(a.db, { nodeId: 'topic', baseVersionId: baseVersionId!, versionId: versionId!,
      content: content!, title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  }
  const restored = await a.current();
  expect(restored.snapshot.text_selection?.version_id).toBe('a-again');
  a.sqlite.prepare("UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = 'topic'").run(JSON.stringify([image]));
  flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(a.sqlite), 'topic', 'a', now);
  expect((await a.current()).snapshot.text_selection).toEqual(restored.snapshot.text_selection);
});


it('reuses the submitted body digest while preparing a complete local edit', async () => {
  const a = device(); await a.receive([textBranch('base', 'Base')]);
  const content = `Changed 文😀\r\n![image](asset://${image.storage_key})`;
  const bodyHash = vi.spyOn(bodyHashing, 'hashTextBody');
  const input = { nodeId: 'topic', baseVersionId: 'base', versionId: 'measured', content,
    title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now,
    newImageReferences: [{ ...image, source_url: 'https://example.com/original.png' }] };
  let measuredBodyCalls = 0;
  let prepared: Parameters<NonNullable<Parameters<typeof applyLocalContentEdit>[2]>>[0] | undefined;
  try {
    await expect(applyLocalContentEdit(a.db, input, record => {
      prepared = record;
      measuredBodyCalls = bodyHash.mock.calls.filter(([value]) => value === content).length;
      throw new Error('preparation_measured');
    })).rejects.toThrow('preparation_measured');
    expect(prepared?.body_text).toBe(content);
    expect(prepared?.snapshot.text_selection?.version_id).toBe('measured');
    expect(JSON.parse(prepared!.snapshot.image_sources!)[image.storage_key]).toBe('https://example.com/original.png');
    expect(prepared?.content_hash).toBe(snapshotHashing.hashText(JSON.stringify(prepared!.snapshot)));
    expect(measuredBodyCalls).toBe(1);
  } finally { vi.restoreAllMocks(); }
  expect((await a.current()).version_id).toBe('base');
  await applyLocalContentEdit(a.db, input);
  expect((await a.current()).body_text).toBe(content);
});
