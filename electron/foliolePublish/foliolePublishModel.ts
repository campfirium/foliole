import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FoliolePublishTopic {
  file: string;
  number: number;
  published_at: string;
  source_node_id: string | null;
  source_key: string;
  status: 'published' | 'unpublished';
  title: string;
  updated_at: string;
}

export interface FoliolePublishIndex {
  next_topic_number: number;
  site: { title: string };
  topics: FoliolePublishTopic[];
  version: 3;
}

type FoliolePublishTopicV2 = Omit<FoliolePublishTopic, 'source_node_id' | 'status'>;
interface FoliolePublishIndexV2 extends Omit<FoliolePublishIndex, 'topics' | 'version'> {
  topics: FoliolePublishTopicV2[];
  version: 2;
}

export class FoliolePublishMigrationRequiredError extends Error {
  constructor() {
    super('Foliole Publish data needs an update before it can be managed.');
    this.name = 'FoliolePublishMigrationRequiredError';
  }
}

export function stableTopicSourceKey(nodeId: string) {
  return createHash('sha256').update(nodeId).digest('hex').slice(0, 20);
}

export function emptyPublishIndex(): FoliolePublishIndex {
  return { next_topic_number: 1, site: { title: '' }, topics: [], version: 3 };
}

function isTopicV2(value: unknown): value is FoliolePublishTopicV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const topic = value as Partial<FoliolePublishTopicV2>;
  return typeof topic.file === 'string' && Number.isSafeInteger(topic.number) && Number(topic.number) > 0 &&
    typeof topic.published_at === 'string' && typeof topic.source_key === 'string' && Boolean(topic.source_key) &&
    typeof topic.title === 'string' && typeof topic.updated_at === 'string';
}

function isTopic(value: unknown): value is FoliolePublishTopic {
  if (!isTopicV2(value)) return false;
  const topic = value as Partial<FoliolePublishTopic>;
  return (topic.source_node_id === null || typeof topic.source_node_id === 'string') &&
    (topic.status === 'published' || topic.status === 'unpublished');
}

function hasValidPublishIndexShape(value: unknown, version: 2 | 3, validTopic: (topic: unknown) => boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const index = value as Partial<FoliolePublishIndex>;
  if (index.version !== version || !Array.isArray(index.topics) || !index.topics.every(validTopic) ||
    typeof index.site?.title !== 'string' || !Number.isSafeInteger(index.next_topic_number)) return false;
  const numbers = index.topics.map((topic) => topic.number);
  const sourceKeys = index.topics.map((topic) => topic.source_key);
  const maximum = numbers.length > 0 ? Math.max(...numbers) : 0;
  return Number(index.next_topic_number) > maximum &&
    new Set(numbers).size === numbers.length && new Set(sourceKeys).size === sourceKeys.length;
}

function isPublishIndexV2(value: unknown): value is FoliolePublishIndexV2 {
  return hasValidPublishIndexShape(value, 2, isTopicV2);
}

function isPublishIndex(value: unknown): value is FoliolePublishIndex {
  return hasValidPublishIndexShape(value, 3, isTopic);
}

function parsePublishIndexFile(root: string) {
  const file = path.join(root, 'publish.yaml');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown; }
  catch { throw new Error('Foliole Publish index is unreadable. Restore publish.yaml before publishing again.'); }
}

export function readPublishIndex(root: string) {
  const parsed = parsePublishIndexFile(root);
  if (parsed === null) return emptyPublishIndex();
  if ((parsed as { version?: unknown })?.version === 1) {
    throw new Error('Foliole Publish index uses the retired format. Convert publish.yaml before publishing again.');
  }
  if (isPublishIndexV2(parsed)) throw new FoliolePublishMigrationRequiredError();
  if (!isPublishIndex(parsed)) throw new Error('Foliole Publish index is invalid. Restore publish.yaml before publishing again.');
  return parsed;
}

export function publishIndexNeedsMigration(root: string) {
  const parsed = parsePublishIndexFile(root);
  return parsed !== null && isPublishIndexV2(parsed);
}

export function migratePublishIndexV2(root: string, nodeIds: readonly string[], now = new Date().toISOString()) {
  const parsed = parsePublishIndexFile(root);
  if (!isPublishIndexV2(parsed)) throw new Error('Foliole Publish data is not eligible for the v3 update.');
  const nodeIdBySourceKey = new Map(nodeIds.map((nodeId) => [stableTopicSourceKey(nodeId), nodeId]));
  const migrated: FoliolePublishIndex = {
    ...parsed,
    topics: parsed.topics.map((topic) => ({
      ...topic,
      source_node_id: nodeIdBySourceKey.get(topic.source_key) ?? null,
      status: 'published'
    })),
    version: 3
  };
  const source = path.join(root, 'publish.yaml');
  const backup = path.join(root, `publish.v2-backup-${now.replaceAll(':', '-')}.yaml`);
  fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
  try { writePublishIndex(root, migrated); }
  catch (error) { fs.rmSync(backup, { force: true }); throw error; }
  return { backup, index: migrated };
}

export function writeFileAtomic(file: string, contents: string | Buffer) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function writePublishIndex(root: string, index: FoliolePublishIndex) {
  writeFileAtomic(path.join(root, 'publish.yaml'), `${JSON.stringify(index, null, 2)}\n`);
}

export function readFoliolePublishSiteTitle(root: string) {
  return readPublishIndex(root).site.title;
}

export function saveFoliolePublishSiteTitle(root: string, title: string) {
  const normalized = title.trim();
  if (!normalized) throw new Error('Enter a site title.');
  const index = readPublishIndex(root);
  writePublishIndex(root, { ...index, site: { title: normalized } });
  return normalized;
}

export function upsertPublishedTopic(index: FoliolePublishIndex, input: { nodeId: string; title: string }) {
  const now = new Date().toISOString();
  const sourceKey = stableTopicSourceKey(input.nodeId);
  const existing = index.topics.find((topic) => topic.source_key === sourceKey);
  const number = existing?.number ?? index.next_topic_number;
  const topic: FoliolePublishTopic = {
    file: existing?.file ?? `Content/${number}.md`, number,
    published_at: existing?.published_at ?? now,
    source_key: sourceKey, source_node_id: input.nodeId, status: 'published',
    title: input.title.trim() || 'Untitled', updated_at: now
  };
  return {
    index: {
      ...index,
      next_topic_number: existing ? index.next_topic_number : number + 1,
      topics: [topic, ...index.topics.filter((item) => item.source_key !== sourceKey)]
    },
    topic
  };
}

export function markTopicsUnpublished(index: FoliolePublishIndex, nodeIds: readonly string[]) {
  const targets = new Set(nodeIds);
  return markTopicsUnpublishedWhere(index, (topic) => Boolean(topic.source_node_id && targets.has(topic.source_node_id)));
}

export function markTopicsUnpublishedBySourceKeys(index: FoliolePublishIndex, sourceKeys: readonly string[]) {
  const targets = new Set(sourceKeys);
  return markTopicsUnpublishedWhere(index, (topic) => targets.has(topic.source_key));
}

function markTopicsUnpublishedWhere(index: FoliolePublishIndex, matches: (topic: FoliolePublishTopic) => boolean) {
  const now = new Date().toISOString();
  return {
    ...index,
    topics: index.topics.map((topic) => matches(topic)
      ? { ...topic, status: 'unpublished' as const, updated_at: now }
      : topic)
  };
}
