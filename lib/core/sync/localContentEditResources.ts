import { z } from 'zod';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { parseImageSources, serializeImageSources } from '../database/imageSources.js';
import { parseNodeResourceReferences, projectNodeResourceLinks, serializeNodeResourceReferences, type NodeResourceReference } from '../database/nodeResourceReferences.js';
import { hashTextBody } from '../database/textBodyHash.js';
import { collectArticleImageStorageKeys } from '../import/replaceArticleImageSource.js';

import { hashText } from './syncNodeResolution.js';

export type ContentImageReference = NodeResourceReference & { source_url?: string };
const sourceInput = z.array(z.object({ source_url: z.string().url().optional() }).passthrough());

export function parseNewImageReferences(value: unknown): ContentImageReference[] {
  const input = sourceInput.parse(value ?? []);
  const references = parseNodeResourceReferences(JSON.stringify(input));
  if (references.some(reference => reference.role !== 'image')) throw new Error('content_edit_image_role_invalid');
  return references.map(reference => {
    const source = input.find(item => item.storage_key === reference.storage_key)?.source_url;
    return source ? { ...reference, source_url: source } : reference;
  });
}

/** Image resources a later edit can submit again to restore this record's images. */
export function contentImageReferences(record: NativeSyncNodeRecord): ContentImageReference[] {
  const sources = parseImageSources(record.snapshot.image_sources);
  return parseNodeResourceReferences(record.snapshot.resource_references)
    .filter(reference => reference.role === 'image')
    .map((reference): ContentImageReference => {
      const source = sources[reference.storage_key];
      return source ? { ...reference, source_url: source } : reference;
    });
}

export function contentEditImageInputHash(value: unknown) {
  return hashText(JSON.stringify(parseNewImageReferences(value)));
}

export function localContentEditResources(base: NativeSyncNodeRecord, current: NativeSyncNodeRecord,
  content: string, added: readonly NodeResourceReference[]) {
  const submitted = new Set(collectArticleImageStorageKeys(content));
  if (base.body_text === null && parseNodeResourceReferences(base.snapshot.resource_references).some(reference => reference.role === 'image')) {
    throw new Error('content_edit_base_content_unavailable');
  }
  const removed = new Set(collectArticleImageStorageKeys(base.body_text ?? base.snapshot.content ?? '')
    .filter(key => !submitted.has(key)));
  const currentHash = current.snapshot.body_blob_hash ?? (typeof current.body_text === 'string' ? hashTextBody(current.body_text) : null);
  const baseHash = base.snapshot.body_blob_hash ?? (typeof base.body_text === 'string' ? hashTextBody(base.body_text) : null);
  const concurrentBodies = currentHash !== baseHash
    && typeof current.body_text === 'string' ? [{ text: current.body_text }] : [];
  const protectedKeys = new Set([...base.alternative_bodies ?? [], ...current.alternative_bodies ?? [], ...concurrentBodies]
    .flatMap(body => collectArticleImageStorageKeys(body.text)));
  const references = parseNodeResourceReferences(current.snapshot.resource_references)
    .filter(reference => reference.role !== 'image' || !removed.has(reference.storage_key) || protectedKeys.has(reference.storage_key));
  for (const reference of added) {
    if (submitted.has(reference.storage_key) && !references.some(existing =>
      existing.storage_key === reference.storage_key && existing.role === 'image')) references.push(reference);
  }
  return serializeNodeResourceReferences(references);
}

export function localContentEditImageSources(current: NativeSyncNodeRecord, content: string, added: readonly ContentImageReference[]) {
  const sources = parseImageSources(current.snapshot.image_sources);
  const submitted = new Set(collectArticleImageStorageKeys(content));
  for (const reference of added) {
    if (reference.source_url && submitted.has(reference.storage_key)) sources[reference.storage_key] ??= reference.source_url;
  }
  return serializeImageSources(sources);
}

/** Carry names for selected alternate bodies from the immutable branch that owns them. */
export function retainAlternativeImageResources(record: NativeSyncNodeRecord, sources: readonly NativeSyncNodeRecord[]) {
  const needed = new Set((record.alternative_bodies ?? []).flatMap(body => collectArticleImageStorageKeys(body.text)));
  const references = parseNodeResourceReferences(record.snapshot.resource_references);
  const orderedSources = [...sources].sort((left, right) =>
    `${left.version_created_at}\n${left.version_id}`.localeCompare(`${right.version_created_at}\n${right.version_id}`));
  for (const source of orderedSources) {
    for (const reference of parseNodeResourceReferences(source.snapshot.resource_references)) {
      if (reference.role === 'image' && needed.has(reference.storage_key) &&
          !references.some(existing => existing.role === 'image' && existing.storage_key === reference.storage_key)) references.push(reference);
    }
  }
  const resources = serializeNodeResourceReferences(references);
  if (resources === serializeNodeResourceReferences(parseNodeResourceReferences(record.snapshot.resource_references))) return {};
  return { resource_references: resources, attachments: projectNodeResourceLinks(resources) };
}
