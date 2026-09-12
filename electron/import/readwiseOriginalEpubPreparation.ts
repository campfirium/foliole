import {
  collectMarkdownImageReferences,
  parseMarkdownImageTarget
} from '../../lib/core/import/markdownImageReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { prepareCanonicalImageAttachment } from '../attachments/importImageAttachmentBytes.js';
import {
  cleanCreatedManagedAttachmentFiles,
  stageManagedAttachmentFile,
  type StagedManagedAttachment
} from '../attachments/managedAttachmentFileStage.js';
import { readRawEpubBookBytes, type RawEpubBook } from '../ipc/epubImportBook.js';

import type { PreparedReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

const EPUB_MIME = 'application/epub+zip';

interface PreparedBody {
  attachmentIds: string[];
  content: string;
}

export interface PreparedOriginalEpubCandidate {
  epubAttachment: StagedManagedAttachment;
  images: PreparedReadwiseApiEpubImages;
  stages: StagedManagedAttachment[];
}

async function prepareBody(
  content: string,
  embeddedImages: RawEpubBook['rootEmbeddedImages'],
  now: string,
  stages: Map<string, StagedManagedAttachment>
): Promise<PreparedBody> {
  const byDestination = new Map(embeddedImages.map((image) => [image.destination, image]));
  const attachmentIds = new Set<string>();
  let rewritten = '';
  let cursor = 0;
  for (const reference of collectMarkdownImageReferences(content)) {
    rewritten += content.slice(cursor, reference.start);
    cursor = reference.end;
    const parsed = parseMarkdownImageTarget(reference.rawTarget);
    const image = parsed ? byDestination.get(parsed.destination) : null;
    if (!parsed || !image) {
      rewritten += reference.fullMatch;
      continue;
    }
    const canonical = prepareCanonicalImageAttachment(image.bytes);
    if (!canonical) throw new Error('original_epub_image_invalid');
    attachmentIds.add(canonical.hash);
    let stage = stages.get(canonical.hash);
    if (!stage) {
      stage = await stageManagedAttachmentFile({
        bytes: image.bytes,
        mimeType: canonical.mimeType,
        now,
        originalName: image.originalName
      });
      stages.set(canonical.hash, stage);
    }
    const suffix = parsed.suffix ? ` ${parsed.suffix}` : '';
    rewritten += `![${reference.altText}](${buildAssetMarkdownUrl(canonical.storageKey)}${suffix})`;
  }
  rewritten += content.slice(cursor);
  return {
    attachmentIds: [...attachmentIds],
    content: rewritten
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
  bytes: Uint8Array;
  now: string;
  title: string;
}): Promise<PreparedOriginalEpubCandidate> {
  const book = readRawEpubBookBytes(input.bytes, `${input.title}.epub`);
  if (!book.nodes.some((node) => node.content.trim())) throw new Error('original_epub_body_missing');
  const stages = new Map<string, StagedManagedAttachment>();
  try {
    const epubAttachment = await stageManagedAttachmentFile({
      bytes: input.bytes,
      mimeType: EPUB_MIME,
      now: input.now,
      originalName: `${input.title}.epub`
    });
    stages.set(epubAttachment.contentHash, epubAttachment);
    const root = await prepareBody(book.rootContent, book.rootEmbeddedImages, input.now, stages);
    const preparedNodes: PreparedReadwiseApiEpubImages['sections'] = [];
    for (const node of book.nodes) {
      const prepared = await prepareBody(node.content, node.embeddedImages, input.now, stages);
      preparedNodes.push({
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
      epubAttachment,
      images: {
        accounting: {
          conversionDroppedCount: 0,
          localizedBodyCount: stages.size - 1,
          sourceBodyCount: stages.size - 1,
          treeBodyCount: stages.size - 1,
          unavailableBodyCount: 0
        },
        coverState: root.attachmentIds.length ? 'localized' : 'missing',
        degradedReason: null,
        rootAttachmentIds: root.attachmentIds,
        rootBody: root.content,
        sections: preparedNodes
      },
      stages: [...stages.values()]
    };
  } catch (error) {
    await cleanCreatedManagedAttachmentFiles([...stages.values()]);
    throw error;
  }
}
