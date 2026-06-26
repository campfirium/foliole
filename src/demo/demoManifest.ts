import { createHash } from 'node:crypto';

import { canonicalDemoPath, canonicalGuidePath, getDemoTopicsForLocale, type DemoTopic } from './demoContent';
import { GENERATED_DEMO_PACKS } from './generated/demoPacks';

export const DEMO_MANIFEST_FILE = 'demo-manifest.json';
export const DEMO_CONTRACT_VERSION = 3;
const DEMO_LOCALE_REGISTRY = [
  { locale: 'en', hreflang: 'en' },
  { locale: 'zh-hans', hreflang: 'zh-Hans' },
  { locale: 'zh-hant', hreflang: 'zh-Hant' },
  { locale: 'ja', hreflang: 'ja' }
] as const;
const GENERATED_DEMO_PACK_LOCALES = Object.keys(GENERATED_DEMO_PACKS);
export const DEMO_PUBLISHED_LOCALES = DEMO_LOCALE_REGISTRY.filter((locale) => GENERATED_DEMO_PACK_LOCALES.includes(locale.locale));

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const DEMO_TOPIC_PATH_PATTERN = /^\/(?:en|zh-hans)\/guides\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\/$/;

export type DemoLocalePathSegment = (typeof DEMO_PUBLISHED_LOCALES)[number]['locale'];
export type DemoHreflang = (typeof DEMO_PUBLISHED_LOCALES)[number]['hreflang'];
type DemoPublishedLocale = (typeof DEMO_PUBLISHED_LOCALES)[number];

export interface DemoRuntimeAsset {
  path: string;
  type: 'script' | 'style';
}

export interface DemoManifestTopic {
  alternates: DemoAlternatePath[];
  slug: string;
  title: string;
  description: string;
  canonicalPath: string;
  contentHash: string;
  hreflang: DemoHreflang;
  highlights: DemoTopic['highlights'];
  locale: DemoLocalePathSegment;
  reviewItems: DemoTopic['reviewItems'];
  runtime: DemoTopic['runtime'];
  sections: DemoTopic['sections'];
  summary: string;
  demoPath: string;
  xDefaultPath: string;
}

export interface DemoAlternatePath {
  locale: DemoLocalePathSegment;
  hreflang: DemoHreflang;
  path: string;
}

export interface DemoLocalePublishPack {
  locale: DemoLocalePathSegment;
  hreflang: DemoHreflang;
  topics: DemoManifestTopic[];
}

export interface DemoManifest {
  contractVersion: 3;
  generatedAt: string;
  buildHash: string;
  publishedLocales: readonly (typeof DEMO_PUBLISHED_LOCALES)[number][];
  localePublishPacks: DemoLocalePublishPack[];
  runtime: {
    entry: 'index.html';
    assets: DemoRuntimeAsset[];
  };
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
    canonicalPath: canonicalGuidePath(topic.slug),
    demoPath: canonicalDemoPath(),
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

function fallbackWarningForSlug(slug: string) {
  return `fallback-en: ${slug}`;
}

function localeHasTopicSource(locale: DemoPublishedLocale, slug: string) {
  if (locale.locale === 'en') return true;
  return !GENERATED_DEMO_PACKS[locale.locale]?.source.warnings.includes(fallbackWarningForSlug(slug));
}

function createAlternates(slug: string): DemoAlternatePath[] {
  return DEMO_PUBLISHED_LOCALES.filter((locale) => localeHasTopicSource(locale, slug)).map((locale) => ({
    locale: locale.locale,
    hreflang: locale.hreflang,
    path: canonicalGuidePath(slug, locale.locale)
  }));
}

function assertValidManifestTopic(topic: DemoManifestTopic) {
  if (!DEMO_TOPIC_PATH_PATTERN.test(topic.canonicalPath)) {
    throw new Error(`Invalid Demo topic canonicalPath: ${topic.canonicalPath}`);
  }
  if (topic.xDefaultPath !== canonicalGuidePath(topic.slug)) {
    throw new Error(`Invalid Demo topic xDefaultPath: ${topic.xDefaultPath}`);
  }
  const selfReference = topic.alternates.some((alternate) => alternate.locale === topic.locale && alternate.path === topic.canonicalPath);
  if (!selfReference) throw new Error(`Demo topic alternates must include self-reference: ${topic.slug}`);
}

export function createDemoManifestTopic(topic: DemoTopic, locale: DemoPublishedLocale = DEMO_PUBLISHED_LOCALES[0]): DemoManifestTopic {
  const projection = demoManifestProjection(topic);
  const manifestTopic: DemoManifestTopic = {
    slug: projection.slug,
    title: projection.title,
    description: projection.description,
    canonicalPath: canonicalGuidePath(projection.slug, locale.locale),
    alternates: createAlternates(projection.slug),
    hreflang: locale.hreflang,
    highlights: projection.highlights,
    locale: locale.locale,
    reviewItems: projection.reviewItems,
    runtime: projection.runtime,
    sections: projection.sections,
    summary: projection.summary,
    demoPath: canonicalDemoPath(locale.locale),
    xDefaultPath: canonicalGuidePath(projection.slug),
    contentHash: sha256Uri(stableJson(projection))
  };
  assertValidManifestTopic(manifestTopic);
  return manifestTopic;
}

export function createDemoManifest(args: {
  assets: DemoRuntimeAsset[];
  generatedAt?: string;
  topics?: DemoTopic[];
}): DemoManifest {
  const localePublishPacks = DEMO_PUBLISHED_LOCALES.map((locale) => ({
    locale: locale.locale,
    hreflang: locale.hreflang,
    topics: (args.topics ?? getDemoTopicsForLocale(locale.locale)).map((topic) => createDemoManifestTopic(topic, locale))
  }));
  const runtime = {
    entry: 'index.html' as const,
    assets: [...args.assets].sort((left, right) => left.path.localeCompare(right.path))
  };
  return {
    contractVersion: DEMO_CONTRACT_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    buildHash: sha256Uri(stableJson({ localePublishPacks, runtime })),
    publishedLocales: DEMO_PUBLISHED_LOCALES,
    localePublishPacks,
    runtime,
  };
}
