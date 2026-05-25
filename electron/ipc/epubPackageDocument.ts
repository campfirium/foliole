import path from 'node:path';

import type { ManifestItem } from './epubImportRootContent.js';

export interface SpineItem {
  idref: string;
  linear: boolean;
}

function parseAttributes(fragment: string) {
  const attributes: Record<string, string> = {};
  for (const match of fragment.matchAll(/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = match[1];
    if (!name) continue;
    attributes[name.toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

export function readPackagePath(containerXml: string) {
  const match = containerXml.match(/<rootfile\b([^>]*)\/?>/i);
  const fullPath = match?.[1] ? parseAttributes(match[1])['full-path'] : null;
  if (!fullPath) {
    throw new Error('EPUB import failed: missing package document path in META-INF/container.xml');
  }
  return fullPath.replace(/\\/g, '/');
}

export function parseManifest(opfXml: string, opfDirectory: string) {
  const manifest = new Map<string, ManifestItem>();
  for (const match of opfXml.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const fragment = match[1];
    if (!fragment) continue;
    const attributes = parseAttributes(fragment);
    if (!attributes.id || !attributes.href) continue;
    manifest.set(attributes.id, {
      href: path.posix.normalize(path.posix.join(opfDirectory, attributes.href.replace(/\\/g, '/'))),
      mediaType: attributes['media-type'] ?? null,
      properties: (attributes.properties ?? '')
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean)
    });
  }
  return manifest;
}

export function parseSpine(opfXml: string) {
  return Array.from(opfXml.matchAll(/<itemref\b([^>]*)\/?>/gi))
    .flatMap((match) => match[1] ? [parseAttributes(match[1])] : [])
    .filter((attributes) => attributes.idref)
    .map((attributes) => ({
      idref: attributes.idref as string,
      linear: attributes.linear !== 'no'
    }) satisfies SpineItem);
}

export function parseGuideCoverPaths(opfXml: string, opfDirectory: string) {
  return new Set(
    Array.from(opfXml.matchAll(/<reference\b([^>]*)\/?>/gi))
      .flatMap((match) => match[1] ? [parseAttributes(match[1])] : [])
      .filter((attributes) => attributes.type?.toLowerCase() === 'cover' && attributes.href)
      .map((attributes) => path.posix.normalize(path.posix.join(opfDirectory, attributes.href?.replace(/\\/g, '/') ?? '')))
  );
}

export function readBookTitle(opfXml: string, sourceName: string) {
  const titleMatch = opfXml.match(/<(?:dc:title|title)\b[^>]*>([\s\S]*?)<\/(?:dc:title|title)>/i);
  return titleMatch?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || path.basename(sourceName, '.epub');
}
