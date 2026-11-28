import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { classifyAttachmentBytes } from '../../platform/attachmentByteClassification.js';
import { buildCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { isDataUrlDestination, normalizeSafeMarkdownDataImageUrl } from '../../platform/markdownImageDataUrl.js';
import type { NodeResourceReference } from '../database/nodeResourceReferences.js';
import { folioleMarkdownParser } from '../markdown/folioleMarkdownParser.js';
import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';

import type { PreparedImportHighlightRecord, PreparedImportRecord } from './contract.js';
import { compactConsecutiveSmallDataImages } from './importImageReferences.js';

export const UNIMPORTABLE_IMAGE_PLACEHOLDER = '[Image could not be imported]';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export interface ImportDataImage {
  bytes: Uint8Array;
  hash: string;
  mimeType: string;
  storageKey: string;
}

interface Replacement {
  from: number;
  to: number;
  text: string;
}

function decodeImage(destination: string): ImportDataImage | null {
  const url = normalizeSafeMarkdownDataImageUrl(destination);
  if (!url) return null;
  const payload = url.slice(url.indexOf(',') + 1);
  if ((payload.length / 4) * 3 > MAX_IMAGE_BYTES + 2) return null;
  let binary: string;
  try { binary = globalThis.atob(payload); } catch { return null; }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mimeType = classifyAttachmentBytes(bytes);
  if (!mimeType.startsWith('image/')) return null;
  const hash = bytesToHex(sha256(bytes));
  const storageKey = buildCanonicalAttachmentStorageKey(hash, mimeType);
  return storageKey ? { bytes, hash, mimeType, storageKey } : null;
}

function collectDataImageNodes(content: string) {
  const nodes: { from: number; to: number; urlFrom: number; urlTo: number; destination: string }[] = [];
  folioleMarkdownParser.parse(content).iterate({
    enter(node) {
      if (node.name !== 'Image') return;
      const url = node.node.getChild('URL');
      if (!url) return;
      const raw = content.slice(url.from, url.to);
      const destination = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
      if (!isDataUrlDestination(destination) && !normalizeSafeMarkdownDataImageUrl(destination)) return;
      nodes.push({ from: node.from, to: node.to, urlFrom: url.from, urlTo: url.to, destination });
    }
  });
  return nodes;
}

function applyReplacements(content: string, replacements: Replacement[]) {
  let next = '';
  let cursor = 0;
  for (const replacement of replacements) {
    next += content.slice(cursor, replacement.from) + replacement.text;
    cursor = replacement.to;
  }
  return next + content.slice(cursor);
}

function rewriteHighlights(highlights: PreparedImportHighlightRecord[] | undefined, renames: Map<string, string>) {
  const rewrite = (text: string) => [...renames].reduce((value, [from, to]) => value.split(from).join(to), text);
  return highlights?.map(highlight => ({
    ...highlight,
    content: rewrite(highlight.content),
    ...(highlight.locatorText ? { locatorText: rewrite(highlight.locatorText) } : {})
  }));
}

/**
 * Moves inline base64 images out of a record before it is stored, so the body budget is judged on the
 * final text. An image that cannot become an attachment stays inline while it fits in one body part;
 * a larger one is replaced by a placeholder. Fingerprints keep describing the original source.
 */
export function localizeImportDataImages(prepared: PreparedImportRecord) {
  const images = new Map<string, ImportDataImage>();
  if (!prepared.content.includes('data')) return { prepared, images: [] };
  const content = compactConsecutiveSmallDataImages(prepared.content);
  const replacements: Replacement[] = [];
  const renames = new Map<string, string>();
  let kept = 0;
  let removed = 0;

  for (const node of collectDataImageNodes(content)) {
    const original = content.slice(node.from, node.to);
    const image = decodeImage(node.destination);
    let replacement: Replacement;
    if (image) {
      images.set(image.storageKey, image);
      replacement = { from: node.urlFrom, to: node.urlTo, text: buildAssetMarkdownUrl(image.storageKey) };
    } else if (utf8ByteLength(original) > TEXT_BODY_MAX_BYTES) {
      removed += 1;
      replacement = { from: node.from, to: node.to, text: UNIMPORTABLE_IMAGE_PLACEHOLDER };
    } else {
      kept += 1;
      continue;
    }
    replacements.push(replacement);
    renames.set(original, content.slice(node.from, replacement.from) + replacement.text
      + content.slice(replacement.to, node.to));
  }

  const reasons = [prepared.degradedReason,
    kept ? `Inline images kept as text data: ${kept}` : null,
    removed ? `Inline images could not be imported: ${removed}` : null].filter(Boolean);
  const resources: NodeResourceReference[] = [...images.keys()].map(storageKey => ({
    storage_key: storageKey, original_name: `inline-image${storageKey.slice(storageKey.lastIndexOf('.'))}`, role: 'image'
  }));
  const matchedHighlights = rewriteHighlights(prepared.matchedHighlights, renames);
  const unmatchedHighlights = rewriteHighlights(prepared.unmatchedHighlights, renames);
  return {
    prepared: {
      ...prepared,
      content: applyReplacements(content, replacements),
      degradedReason: reasons.join('; ') || null,
      ...(matchedHighlights ? { matchedHighlights } : {}),
      ...(unmatchedHighlights ? { unmatchedHighlights } : {}),
      ...(resources.length
        ? { localizedImageResources: [...(prepared.localizedImageResources ?? []), ...resources] } : {})
    },
    images: [...images.values()]
  };
}
