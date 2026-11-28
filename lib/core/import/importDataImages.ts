import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { buildAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { classifyAttachmentBytes } from '../../platform/attachmentByteClassification.js';
import { buildCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { normalizeSafeMarkdownDataImageUrl } from '../../platform/markdownImageDataUrl.js';
import type { NodeResourceReference } from '../database/nodeResourceReferences.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { PreparedImportHighlightRecord, PreparedImportRecord } from './contract.js';
import { collectImportDataImageNodes, collectUnusedDefinitionRemovals } from './importDataImageNodes.js';
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
  // A shortcut reference such as `![a]` must not match the start of another image.
  const rewrite = (text: string) => [...renames].reduce((value, [from, to]) => from.endsWith(')') || from.endsWith('>')
    ? value.split(from).join(to)
    : value.replace(new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![[(])`, 'g'), () => to), text);
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

  const { nodes, definitions, linkedLabels } = collectImportDataImageNodes(content);
  const replacedLabels = new Set<string>();

  for (const node of nodes) {
    const original = content.slice(node.from, node.to);
    const image = decodeImage(node.destination);
    let text: string;
    if (image) {
      images.set(image.storageKey, image);
      text = node.render(buildAssetMarkdownUrl(image.storageKey));
    } else if (node.byteLength > TEXT_BODY_MAX_BYTES) {
      removed += 1;
      text = UNIMPORTABLE_IMAGE_PLACEHOLDER;
    } else {
      kept += 1;
      continue;
    }
    if (node.referenceLabel !== undefined) replacedLabels.add(node.referenceLabel);
    replacements.push({ from: node.from, to: node.to, text });
    renames.set(original, text);
  }
  replacements.push(...collectUnusedDefinitionRemovals(content, definitions,
    [...replacedLabels].filter(label => !linkedLabels.has(label))));
  replacements.sort((left, right) => left.from - right.from);

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
