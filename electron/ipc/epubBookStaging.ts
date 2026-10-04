import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';

import type { RawEpubBook } from './epubImportBook.js';
import type { RawBookNode } from './epubImportTree.js';
import { attachStagedEpubText, createFileBackedEpubImage, epubImageFilePath, stagedEpubTextPath } from './epubStagedContent.js';

type StagedImage = Omit<PreparedImportEmbeddedImage, 'bytes'> & { filePath: string };
type StagedNode = Omit<RawBookNode, 'content' | 'embeddedImages'> & { contentPath: string; embeddedImages: StagedImage[] };
export interface StagedEpubBook {
  nodes: StagedNode[];
  rootContentPath: string;
  rootDegradedReason: string | null;
  rootEmbeddedImages: StagedImage[];
  title: string;
}

function stageImage(image: PreparedImportEmbeddedImage): StagedImage {
  const filePath = epubImageFilePath(image);
  if (!filePath) throw new Error('Missing EPUB image file');
  return { destination: image.destination, mimeType: image.mimeType, originalName: image.originalName, filePath };
}

export function serializeStagedEpubBook(book: RawEpubBook): StagedEpubBook {
  return {
    nodes: book.nodes.map((node) => ({
      contentPath: stagedEpubTextPath(node, 'content'),
      degradedReason: node.degradedReason, embeddedImages: node.embeddedImages.map(stageImage),
      key: node.key, parentKey: node.parentKey, title: node.title
    })),
    rootContentPath: stagedEpubTextPath(book, 'rootContent'),
    rootDegradedReason: book.rootDegradedReason,
    rootEmbeddedImages: book.rootEmbeddedImages.map(stageImage), title: book.title
  };
}

export function hydrateStagedEpubBook(staged: StagedEpubBook): RawEpubBook {
  const reviveImage = ({ filePath, ...image }: StagedImage) => createFileBackedEpubImage(image, filePath);
  const nodes = staged.nodes.map(({ contentPath, embeddedImages, ...node }) =>
    attachStagedEpubText({ ...node, content: '', embeddedImages: embeddedImages.map(reviveImage) }, 'content', contentPath));
  return attachStagedEpubText({
    nodes, rootContent: '', rootDegradedReason: staged.rootDegradedReason,
    rootEmbeddedImages: staged.rootEmbeddedImages.map(reviveImage), title: staged.title
  }, 'rootContent', staged.rootContentPath);
}
