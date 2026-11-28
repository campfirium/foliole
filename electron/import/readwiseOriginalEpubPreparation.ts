import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { localizeDataImageContent } from '../../lib/core/import/importDataImages.js';
import {
  collectMarkdownImageReferences,
  parseMarkdownImageTarget
} from '../../lib/core/import/markdownImageReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { prepareCanonicalImageAttachment } from '../attachments/importImageAttachmentBytes.js';
import { prepareCanonicalImageAttachmentFile, stageManagedAttachmentFileCopy } from '../attachments/managedAttachmentFileCopy.js';
import {
  cleanCreatedManagedAttachmentFiles,
  stageManagedAttachmentFile,
  type StagedManagedAttachment
} from '../attachments/managedAttachmentFileStage.js';
import { readRawEpubBook, readRawEpubBookBytes, type RawEpubBook } from '../ipc/epubImportBook.js';
import { epubImageFilePath } from '../ipc/epubStagedContent.js';

import type { PreparedReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

interface PreparedBody {
  resourceReferences: NodeResourceReference[];
  attachmentIds: string[];
  content: string;
  degradedReason: string | null;
}

export interface PreparedOriginalEpubCandidate {
  images: PreparedReadwiseApiEpubImages;
  stages: StagedManagedAttachment[];
}

async function stageBytes(
  image: { bytes: Uint8Array; hash: string; mimeType: string; originalName: string },
  now: string,
  stages: Map<string, StagedManagedAttachment>
) {
  if (stages.has(image.hash)) return;
  stages.set(image.hash, await stageManagedAttachmentFile({
    bytes: image.bytes, mimeType: image.mimeType, now, originalName: image.originalName
  }));
}

async function prepareBody(
  source: string,
  embeddedImages: RawEpubBook['rootEmbeddedImages'],
  now: string,
  stages: Map<string, StagedManagedAttachment>,
  signal?: AbortSignal
): Promise<PreparedBody> {
  const byDestination = new Map(embeddedImages.map((image) => [image.destination, image]));
  const attachmentIds = new Set<string>();
  const references = new Map<string, NodeResourceReference>();
  const inline = localizeDataImageContent(source);
  const content = inline.content;
  for (const [index, image] of inline.images.entries()) {
    signal?.throwIfAborted();
    const reference = inline.resources[index]!;
    await stageBytes({ ...image, originalName: reference.original_name ?? image.storageKey }, now, stages);
    attachmentIds.add(image.hash);
    references.set(image.storageKey, reference);
  }
  let rewritten = '';
  let cursor = 0;
  for (const reference of collectMarkdownImageReferences(content)) {
    signal?.throwIfAborted();
    rewritten += content.slice(cursor, reference.start);
    cursor = reference.end;
    const parsed = parseMarkdownImageTarget(reference.rawTarget);
    const image = parsed ? byDestination.get(parsed.destination) : null;
    if (!parsed || !image) {
      rewritten += reference.fullMatch;
      continue;
    }
    const filePath = epubImageFilePath(image);
    const canonical = filePath ? await prepareCanonicalImageAttachmentFile(filePath) : prepareCanonicalImageAttachment(image.bytes);
    if (!canonical) throw new Error('original_epub_image_invalid');
    attachmentIds.add(canonical.hash);
    references.set(canonical.storageKey, { storage_key: canonical.storageKey, original_name: image.originalName, role: 'image' });
    signal?.throwIfAborted();
    if (!filePath) {
      await stageBytes({ bytes: image.bytes, hash: canonical.hash, mimeType: canonical.mimeType,
        originalName: image.originalName }, now, stages);
    } else if (!stages.has(canonical.hash)) {
      stages.set(canonical.hash, await stageManagedAttachmentFileCopy({
        sourcePath: filePath, contentHash: canonical.hash, mimeType: canonical.mimeType,
        now, originalName: image.originalName
      }));
    }
    const suffix = parsed.suffix ? ` ${parsed.suffix}` : '';
    rewritten += `![${reference.altText}](${buildAssetMarkdownUrl(canonical.storageKey)}${suffix})`;
  }
  rewritten += content.slice(cursor);
  return {
    resourceReferences: [...references.values()],
    attachmentIds: [...attachmentIds],
    content: rewritten,
    degradedReason: inline.degradedReason
  };
}

function nodeDepth(nodes: RawEpubBook['nodes'], key: string) {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  let depth = 1;
  let current = byKey.get(key);
  const seen = new Set<string>();
  while (current?.parentKey && !seen.has(current.parentKey)) {
    seen.add(current.parentKey);
    current = byKey.get(current.parentKey);
    depth += 1;
  }
  return depth;
}

export async function prepareOriginalEpubCandidate(input: {
  bytes?: Uint8Array;
  filePath?: string;
  now: string;
  signal?: AbortSignal;
  title: string;
}): Promise<PreparedOriginalEpubCandidate> {
  input.signal?.throwIfAborted();
  if (!input.filePath && !input.bytes) throw new Error('original_epub_source_missing');
  const book = input.filePath ? await readRawEpubBook({
    adapterId: 'text_file', kind: 'epub', filePath: input.filePath, sourceName: `${input.title}.epub`
  }) : await readRawEpubBookBytes(input.bytes!, `${input.title}.epub`);
  const stages = new Map<string, StagedManagedAttachment>();
  try {
    input.signal?.throwIfAborted();
    if (!book.nodes.some((node) => node.content.trim())) throw new Error('original_epub_body_missing');
    const root = await prepareBody(book.rootContent, book.rootEmbeddedImages, input.now, stages, input.signal);
    const preparedNodes: PreparedReadwiseApiEpubImages['sections'] = [];
    const degradedReasons = new Set([root.degradedReason]);
    for (const node of book.nodes) {
      const prepared = await prepareBody(node.content, node.embeddedImages, input.now, stages, input.signal);
      degradedReasons.add(prepared.degradedReason);
      preparedNodes.push({
        resourceReferences: prepared.resourceReferences,
        attachmentIds: prepared.attachmentIds,
        content: prepared.content,
        headingLevel: null,
        markerKey: node.key,
        naturalLevel: nodeDepth(book.nodes, node.key),
        parentKey: node.parentKey,
        title: node.title
      });
    }
    return {
      images: {
        accounting: {
          conversionDroppedCount: 0,
          localizedBodyCount: stages.size,
          sourceBodyCount: stages.size,
          treeBodyCount: stages.size,
          unavailableBodyCount: 0
        },
        degradedReason: [...degradedReasons].filter(Boolean).join('; ') || null,
        rootResourceReferences: root.resourceReferences,
        rootAttachmentIds: root.attachmentIds,
        rootBody: root.content,
        sections: preparedNodes
      },
      stages: [...stages.values()]
    };
  } catch (error) {
    if (!input.signal?.aborted) await cleanCreatedManagedAttachmentFiles([...stages.values()]);
    throw error;
  } finally {
    await book.dispose?.();
  }
}
