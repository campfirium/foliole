import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FoliolePublishTopic {
  file: string;
  number: number;
  published_at: string;
  source_key: string;
  title: string;
  updated_at: string;
}

export interface FoliolePublishIndex {
  next_topic_number: number;
  site: { title: string };
  topics: FoliolePublishTopic[];
  version: 2;
}

export function stableTopicSourceKey(nodeId: string) {
  return createHash('sha256').update(nodeId).digest('hex').slice(0, 20);
}

export function emptyPublishIndex(): FoliolePublishIndex {
  return { next_topic_number: 1, site: { title: '' }, topics: [], version: 2 };
}

function isTopic(value: unknown): value is FoliolePublishTopic {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const topic = value as Partial<FoliolePublishTopic>;
  return typeof topic.file === 'string' && Number.isSafeInteger(topic.number) && Number(topic.number) > 0 &&
    typeof topic.published_at === 'string' && typeof topic.source_key === 'string' && Boolean(topic.source_key) &&
    typeof topic.title === 'string' && typeof topic.updated_at === 'string';
}

function isPublishIndex(value: unknown): value is FoliolePublishIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const index = value as Partial<FoliolePublishIndex>;
  if (index.version !== 2 || !Array.isArray(index.topics) || !index.topics.every(isTopic) ||
    typeof index.site?.title !== 'string' || !Number.isSafeInteger(index.next_topic_number)) return false;
  const numbers = index.topics.map((topic) => topic.number);
  const sourceKeys = index.topics.map((topic) => topic.source_key);
  const maximum = numbers.length > 0 ? Math.max(...numbers) : 0;
  return Number(index.next_topic_number) > maximum &&
    new Set(numbers).size === numbers.length && new Set(sourceKeys).size === sourceKeys.length;
}

export function readPublishIndex(root: string) {
  const file = path.join(root, 'publish.yaml');
  if (!fs.existsSync(file)) return emptyPublishIndex();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Foliole Publish index is unreadable. Restore publish.yaml before publishing again.');
  }
  if ((parsed as { version?: unknown })?.version === 1) {
    throw new Error('Foliole Publish index uses the retired format. Convert publish.yaml before publishing again.');
  }
  if (!isPublishIndex(parsed)) throw new Error('Foliole Publish index is invalid. Restore publish.yaml before publishing again.');
  return parsed;
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
    source_key: sourceKey,
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
