
import type { PreparedImportEmbeddedImage } from '../contract.js';

import type { EpubBookEntries, EpubTextStage } from './epubBookEntries.js';
import { splitEpubChaptersByTocFragments } from './epubImportFragmentSections.js';
import { diagnoseEpubImportHealth } from './epubImportHealth.js';
import {
  buildRootCoverFromImage
} from './epubImportRootContent.js';
import { buildSpineChapterNodes } from './epubImportSpine.js';
import { buildBookNodes, type RawBookNode } from './epubImportTree.js';
import {
  parseGuideCoverPaths,
  parseManifest,
  parseSpine,
  readBookTitle,
  readPackagePath
} from './epubPackageDocument.js';
import { epubPath as path } from './epubPath.js';
import { readEpubToc } from './epubToc.js';


export interface RawEpubBook {
  nodes: RawBookNode[];
  rootContent: string;
  rootDegradedReason: string | null;
  rootEmbeddedImages: PreparedImportEmbeddedImage[];
  title: string;
  workingDirectory?: string;
  dispose?: () => Promise<void>;
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes);
}

function readArchiveText(entries: ReadonlyMap<string, Uint8Array>, entryPath: string, message: string) {
  const bytes = entries.get(entryPath);
  if (!bytes) {
    throw new Error(message);
  }
  return decodeText(bytes);
}

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  return current ? `${current}; ${next}` : next;
}

export async function buildRawEpubBook(entries: EpubBookEntries, sourceName: string, stage: EpubTextStage = object => object): Promise<RawEpubBook> {
  await entries.extract('mimetype');
  const mimetype = entries.get('mimetype');
  if (!mimetype || decodeText(mimetype).trim() !== 'application/epub+zip') {
    throw new Error('EPUB import failed: missing or invalid mimetype entry');
  }
  await entries.extract('META-INF/container.xml');
  const containerXml = readArchiveText(entries, 'META-INF/container.xml', 'EPUB import failed: missing META-INF/container.xml');
  const packagePath = readPackagePath(containerXml);
  await entries.extract(packagePath);
  const opfXml = readArchiveText(entries, packagePath, `EPUB import failed: missing package document ${packagePath}`);
  const opfDirectory = path.posix.dirname(packagePath);
  const manifest = parseManifest(opfXml, opfDirectory);
  const guideCoverPaths = parseGuideCoverPaths(opfXml, opfDirectory);
  const spine = parseSpine(opfXml);
  if (spine.length === 0) {
    throw new Error('EPUB import failed: package document does not declare any spine chapters');
  }
  const title = readBookTitle(opfXml, sourceName);
  for (const item of manifest.values()) {
    if (item.properties.includes('nav') || item.mediaType === 'application/x-dtbncx+xml') await entries.extract(item.href);
  }
  const toc = readEpubToc({ entries, manifest, opfDirectory, opfXml });
  const builtSpine = await buildSpineChapterNodes({ entries, guideCoverPaths, manifest, spine, stage });
  const nonLinearHrefs = new Set(
    spine.flatMap((item) => {
      const href = !item.linear ? manifest.get(item.idref)?.href : null;
      return href ? [href] : [];
    })
  );
  const storeNode = <T extends RawBookNode>(node: T) => stage(node, ['content']);
  const nodes = builtSpine.chapters.flatMap((chapter) =>
    splitEpubChaptersByTocFragments({ chapters: [chapter], entries, toc }).map(storeNode));
  nodes.push(...splitEpubChaptersByTocFragments({ chapters: [], entries, nonLinearHrefs, toc }).map(storeNode));
  const healthReason = diagnoseEpubImportHealth(nodes);
  const rootCover = builtSpine.rootCover ?? buildRootCoverFromImage({ entries, manifest, opfXml });

  const book = {
    nodes: buildBookNodes({ chapters: nodes, toc, storeNode }),
    rootContent: rootCover?.content ?? '',
    rootDegradedReason: appendReason(rootCover?.degradedReason ?? null, healthReason),
    rootEmbeddedImages: rootCover?.embeddedImages ?? [],
    title
  };
  return stage(book, ['rootContent']);
}
