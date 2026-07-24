import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { emptyPublishIndex, markTopicsUnpublished, migratePublishIndexV2, publishIndexNeedsMigration, readFoliolePublishSiteTitle, readPublishIndex, saveFoliolePublishSiteTitle, stableTopicSourceKey, upsertPublishedTopic, writePublishIndex } from './foliolePublishModel.js';

const roots: string[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-publish-model-'));
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('assigns permanent Topic numbers and moves a republished Topic to the front', () => {
  const first = upsertPublishedTopic(emptyPublishIndex(), { nodeId: 'topic-1', title: '第一篇' });
  const second = upsertPublishedTopic(first.index, { nodeId: 'topic-2', title: 'Second' });
  const updated = upsertPublishedTopic(second.index, { nodeId: 'topic-1', title: '第一篇（修订）' });

  expect(first.topic).toMatchObject({ number: 1, source_key: stableTopicSourceKey('topic-1'), source_node_id: 'topic-1', status: 'published' });
  expect(second.topic.number).toBe(2);
  expect(updated.topic.number).toBe(1);
  expect(updated.index.next_topic_number).toBe(3);
  expect(updated.index.topics.map((topic) => topic.title)).toEqual(['第一篇（修订）', 'Second']);
  expect(updated.topic.published_at).toBe(first.topic.published_at);
});

it('round-trips the versioned publish index without storing Topic content', () => {
  const root = temporaryRoot();
  const { index } = upsertPublishedTopic(emptyPublishIndex(), { nodeId: 'topic-1', title: 'Public Topic' });
  writePublishIndex(root, index);

  expect(readPublishIndex(root)).toEqual(index);
  expect(fs.readFileSync(path.join(root, 'publish.yaml'), 'utf8')).not.toContain('private body');
});

it('keeps an unpublished record and reuses its permanent number when republished', () => {
  const first = upsertPublishedTopic(emptyPublishIndex(), { nodeId: 'topic-1', title: 'Public' });
  const unpublished = markTopicsUnpublished(first.index, ['topic-1']);
  const republished = upsertPublishedTopic(unpublished, { nodeId: 'topic-1', title: 'Public again' });

  expect(unpublished.topics[0]).toMatchObject({ number: 1, status: 'unpublished' });
  expect(republished.topic).toMatchObject({ number: 1, status: 'published' });
  expect(republished.index.next_topic_number).toBe(2);
});

it('explicitly migrates v2 after backing it up and preserves missing sources as orphans', () => {
  const root = temporaryRoot();
  const v2 = {
    next_topic_number: 3,
    site: { title: 'Legacy' },
    topics: [
      { file: 'Content/1.md', number: 1, published_at: '2026-01-01T00:00:00.000Z', source_key: stableTopicSourceKey('topic-1'), title: 'Found', updated_at: '2026-01-01T00:00:00.000Z' },
      { file: 'Content/2.md', number: 2, published_at: '2026-01-02T00:00:00.000Z', source_key: stableTopicSourceKey('missing'), title: 'Missing', updated_at: '2026-01-02T00:00:00.000Z' }
    ],
    version: 2
  };
  fs.writeFileSync(path.join(root, 'publish.yaml'), `${JSON.stringify(v2)}\n`);

  expect(publishIndexNeedsMigration(root)).toBe(true);
  expect(() => readPublishIndex(root)).toThrow('needs an update');
  const result = migratePublishIndexV2(root, ['topic-1'], '2026-07-24T12:00:00.000Z');

  expect(fs.readFileSync(result.backup, 'utf8')).toContain('"version":2');
  expect(readPublishIndex(root).topics).toMatchObject([
    { source_node_id: 'topic-1', status: 'published' },
    { source_node_id: null, status: 'published' }
  ]);
});

it('rejects the retired index and invalid Topic numbering instead of returning an empty site', () => {
  const root = temporaryRoot();
  fs.writeFileSync(path.join(root, 'publish.yaml'), '{"version":1,"cards":[],"site":{"title":"Old"}}');
  expect(() => readPublishIndex(root)).toThrow('retired format');

  const valid = upsertPublishedTopic(emptyPublishIndex(), { nodeId: 'topic-1', title: 'One' }).index;
  fs.writeFileSync(path.join(root, 'publish.yaml'), JSON.stringify({ ...valid, next_topic_number: 1 }));
  expect(() => readPublishIndex(root)).toThrow('index is invalid');
});

it('persists a normalized site title in the publish index', () => {
  const root = temporaryRoot();
  expect(readFoliolePublishSiteTitle(root)).toBe('');
  expect(saveFoliolePublishSiteTitle(root, '  Working Memory  ')).toBe('Working Memory');
  expect(readFoliolePublishSiteTitle(root)).toBe('Working Memory');
  expect(() => saveFoliolePublishSiteTitle(root, '   ')).toThrow('Enter a site title.');
});
