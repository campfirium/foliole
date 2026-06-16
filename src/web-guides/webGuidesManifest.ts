import { createHash } from 'node:crypto';

import { canonicalGuidePath, WEB_GUIDES, type WebGuideSeed } from './webGuidesContent';

export const WEB_GUIDES_MANIFEST_FILE = 'guides-manifest.json';
export const WEB_GUIDES_CONTRACT_VERSION = 2;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface WebGuidesRuntimeAsset {
  path: string;
  type: 'script' | 'style';
}

export interface WebGuidesManifestGuide {
  slug: string;
  title: string;
  description: string;
  canonicalPath: string;
  contentHash: string;
  highlights: WebGuideSeed['highlights'];
  reviewItems: WebGuideSeed['reviewItems'];
  runtime: WebGuideSeed['runtime'];
  sections: WebGuideSeed['sections'];
  summary: string;
}

export interface WebGuidesManifest {
  contractVersion: 2;
  generatedAt: string;
  buildHash: string;
  runtime: {
    entry: 'index.html';
    assets: WebGuidesRuntimeAsset[];
  };
  guides: WebGuidesManifestGuide[];
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

function assertValidGuide(guide: WebGuideSeed) {
  if (!SLUG_PATTERN.test(guide.slug)) throw new Error(`Invalid Web Guide slug: ${guide.slug}`);
  if (!guide.sections.length) throw new Error(`Web Guide must include sections: ${guide.slug}`);
  if (!guide.blocks.length) throw new Error(`Web Guide must include blocks: ${guide.slug}`);
  for (const section of guide.sections) {
    if (!section.heading || !section.body.length) throw new Error(`Web Guide section is incomplete: ${guide.slug}`);
  }
}

export function guideManifestProjection(guide: WebGuideSeed) {
  assertValidGuide(guide);
  return {
    canonicalPath: canonicalGuidePath(guide.slug),
    highlights: guide.highlights,
    description: guide.description,
    reviewItems: guide.reviewItems,
    runtime: guide.runtime,
    sections: guide.sections,
    slug: guide.slug,
    summary: guide.summary,
    title: guide.title
  };
}

export function createWebGuideManifestGuide(guide: WebGuideSeed): WebGuidesManifestGuide {
  const projection = guideManifestProjection(guide);
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

export function createWebGuidesManifest(args: {
  assets: WebGuidesRuntimeAsset[];
  generatedAt?: string;
  guides?: WebGuideSeed[];
}): WebGuidesManifest {
  const guides = args.guides ?? WEB_GUIDES;
  const manifestGuides = guides.map(createWebGuideManifestGuide);
  const runtime = {
    entry: 'index.html' as const,
    assets: [...args.assets].sort((left, right) => left.path.localeCompare(right.path))
  };
  return {
    contractVersion: WEB_GUIDES_CONTRACT_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    buildHash: sha256Uri(stableJson({ guides: manifestGuides, runtime })),
    runtime,
    guides: manifestGuides
  };
}
