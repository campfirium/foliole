import { createHash } from 'node:crypto';

import { canonicalDemoPath, DEMO_TOPICS, type DemoTopic } from './demoContent';

export const DEMO_MANIFEST_FILE = 'demo-manifest.json';
export const DEMO_CONTRACT_VERSION = 2;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface DemoRuntimeAsset {
  path: string;
  type: 'script' | 'style';
}

export interface DemoManifestTopic {
  slug: string;
  title: string;
  description: string;
  canonicalPath: string;
  contentHash: string;
  highlights: DemoTopic['highlights'];
  reviewItems: DemoTopic['reviewItems'];
  runtime: DemoTopic['runtime'];
  sections: DemoTopic['sections'];
  summary: string;
}

export interface DemoManifest {
  contractVersion: 2;
  generatedAt: string;
  buildHash: string;
  runtime: {
    entry: 'index.html';
    assets: DemoRuntimeAsset[];
  };
  topics: DemoManifestTopic[];
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortStable(item)])
  );
}

function sha256Uri(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function assertValidTopic(topic: DemoTopic) {
  if (!SLUG_PATTERN.test(topic.slug)) throw new Error(`Invalid Demo topic slug: ${topic.slug}`);
  if (!topic.sections.length) throw new Error(`Demo topic must include sections: ${topic.slug}`);
  if (!topic.blocks.length) throw new Error(`Demo topic must include blocks: ${topic.slug}`);
  for (const section of topic.sections) {
    if (!section.heading || !section.body.length) throw new Error(`Demo topic section is incomplete: ${topic.slug}`);
  }
}

export function demoManifestProjection(topic: DemoTopic) {
  assertValidTopic(topic);
  return {
    canonicalPath: canonicalDemoPath(topic.slug),
    highlights: topic.highlights,
    description: topic.description,
    reviewItems: topic.reviewItems,
    runtime: topic.runtime,
    sections: topic.sections,
    slug: topic.slug,
    summary: topic.summary,
    title: topic.title
  };
}

export function createDemoManifestTopic(topic: DemoTopic): DemoManifestTopic {
  const projection = demoManifestProjection(topic);
  return {
    slug: projection.slug,
    title: projection.title,
    description: projection.description,
    canonicalPath: projection.canonicalPath,
    highlights: projection.highlights,
    reviewItems: projection.reviewItems,
    runtime: projection.runtime,
    sections: projection.sections,
    summary: projection.summary,
    contentHash: sha256Uri(stableJson(projection))
  };
}

export function createDemoManifest(args: {
  assets: DemoRuntimeAsset[];
  generatedAt?: string;
  topics?: DemoTopic[];
}): DemoManifest {
  const topics = args.topics ?? DEMO_TOPICS;
  const manifestTopics = topics.map(createDemoManifestTopic);
  const runtime = {
    entry: 'index.html' as const,
    assets: [...args.assets].sort((left, right) => left.path.localeCompare(right.path))
  };
  return {
    contractVersion: DEMO_CONTRACT_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    buildHash: sha256Uri(stableJson({ runtime, topics: manifestTopics })),
    runtime,
    topics: manifestTopics
  };
}
