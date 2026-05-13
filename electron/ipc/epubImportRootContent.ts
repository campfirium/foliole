import path from 'node:path';

import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

export interface ManifestItem {
  href: string;
  mediaType: string | null;
  properties: string[];
}

export interface RootBookContent {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
}

function parseAttributes(fragment: string) {
  const attributes: Record<string, string> = {};
  for (const match of fragment.matchAll(/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    attributes[name.toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function stripLeadingHeading(content: string) {
  return content.replace(/^#\s+.*(?:\n\n|$)/, '').trim();
}

function parseCoverImageItems(opfXml: string, manifest: ReadonlyMap<string, ManifestItem>) {
  const coverIds = new Set(
    Array.from(manifest.entries())
      .filter(([, item]) => item.properties.includes('cover-image'))
      .map(([id]) => id)
  );
  for (const match of opfXml.matchAll(/<meta\b([^>]*)\/?>/gi)) {
    const fragment = match[1];
    if (!fragment) continue;
    const attributes = parseAttributes(fragment);
    if (attributes.name?.toLowerCase() === 'cover' && attributes.content) {
      coverIds.add(attributes.content);
    }
  }
  return Array.from(coverIds)
    .map((id) => manifest.get(id))
    .filter((item): item is ManifestItem => Boolean(item?.href) && Boolean(item?.mediaType?.startsWith('image/')));
}

export function buildCoverRootContentFromChapter(input: {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
}): RootBookContent {
  return {
    content: stripLeadingHeading(input.content),
    degradedReason: input.degradedReason,
    embeddedImages: input.embeddedImages
  };
}

export function buildRootCoverFromImage(input: {
  entries: ReadonlyMap<string, Uint8Array>;
  manifest: ReadonlyMap<string, ManifestItem>;
  opfXml: string;
}) {
  for (const item of parseCoverImageItems(input.opfXml, input.manifest)) {
    const bytes = input.entries.get(item.href);
    if (!bytes || !item.mediaType) {
      continue;
    }
    return {
      content: `![Cover](${item.href})`,
      degradedReason: null,
      embeddedImages: [{
        bytes,
        destination: item.href,
        mimeType: item.mediaType,
        originalName: path.posix.basename(item.href)
      }]
    } satisfies RootBookContent;
  }
  return null;
}
