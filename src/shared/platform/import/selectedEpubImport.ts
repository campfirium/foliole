import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { rewriteEpubEmbeddedImages } from '../../../../lib/core/import/epub/epubImageReferences';
import { buildRawEpubBook } from '../../../../lib/core/import/epub/epubImportBook';
import { buildEpubRootContent, prepareEpubBookNode } from '../../../../lib/core/import/epub/epubPreparedBook';
import { createPreparedDesktopTextImport } from '../../../../lib/core/import/fingerprint';
import { classifyAttachmentBytes } from '../../../../lib/platform/attachmentByteClassification';
import { buildCanonicalAttachmentStorageKey } from '../../../../lib/platform/attachmentResource';

import { SelectedEpubArchive } from './selectedEpubArchive';

export async function prepareSelectedEpubImport(bytes: Uint8Array, name: string, signal?: AbortSignal) {
  const entries = await SelectedEpubArchive.open(bytes, signal);
  const book = await buildRawEpubBook(entries, name);
  await entries.readImages();
  const importedAt = new Date().toISOString();
  const root = createPreparedDesktopTextImport({ content: buildEpubRootContent(book.title, book.rootContent),
    degradedReason: book.rootDegradedReason, fileName: name, filePath: name, importedAt, kind: 'epub',
    sourceIdentity: crypto.randomUUID(), sourceTrackingMode: 'untracked', sourceProfile: 'epub', titleStrategy: 'heading',
    managedEpubImageDestinations: book.rootEmbeddedImages.map(image => image.destination) });
  const sources = new Map<string, { storageKey: string; bytes: Uint8Array }>();
  const localize = async (node: { content: string; embeddedImages: typeof book.rootEmbeddedImages }) => {
    return rewriteEpubEmbeddedImages(node, async image => {
      signal?.throwIfAborted();
      const bytes = image.bytes;
      const mime = classifyAttachmentBytes(bytes);
      const storageKey = mime.startsWith('image/') ? buildCanonicalAttachmentStorageKey(bytesToHex(sha256(bytes)), mime) : null;
      if (!storageKey) return { status: 'error', message: `Unsupported EPUB image: ${image.destination}` };
      sources.set(storageKey, { storageKey, bytes });
      return { status: 'imported', storage_key: storageKey, original_name: image.originalName };
    });
  };
  const rootImages = await localize({ content: root.content, embeddedImages: book.rootEmbeddedImages });
  const chapters = [];
  const reasons = [root.degradedReason, ...rootImages.degradedMessages];
  for (const [index, raw] of book.nodes.entries()) {
    const chapter = prepareEpubBookNode(raw, index, importedAt);
    const images = await localize(chapter);
    reasons.push(chapter.degradedReason, ...images.degradedMessages);
    chapters.push({ ...chapter, content: images.rewrittenContent, resourceReferences: images.resources });
  }
  const degradedReason = [...new Set(reasons.filter(Boolean))].join('; ') || null;
  return { ...root, content: rootImages.rewrittenContent, degradedReason,
    epubBook: { chapters, resources: rootImages.resources, files: [...sources.values()].sort((a, b) => a.storageKey.localeCompare(b.storageKey)) },
    ...(degradedReason ? { importWarning: 'conversion' as const } : {}) };
}
