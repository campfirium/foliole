import { createHash } from 'node:crypto';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { createEpubGeneratedNodeId } from '../../lib/core/import/epubGeneratedNodeIdentity.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';

import { readRawEpubBook } from './epubImportBook.js';
import { importEmbeddedImagesForNode } from './epubImportImages.js';
import { persistImportedOpeningTexts } from './epubImportOpeningText.js';
import { appendReason, applyAggregateDegrade } from './epubImportResult.js';
import { ensureTrackedImportTarget } from './epubImportTracking.js';
import { type RawBookNode } from './epubImportTree.js';
import { applyEpubSequentialReadingMode } from './epubSequentialReading.js';
import { stageEpubText } from './epubStagedContent.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

interface PreparedBookNode {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
  hideTitleHeading: boolean;
  key: string;
  parentKey: string | null;
  title: string;
}

interface EpubImportOptions {
  sequentialReadingMode?: 'free' | 'sequential';
  sourceIdentity?: string;
  sourceTrackingMode?: 'tracked' | 'untracked';
  targetNodeId?: string;
}

function prepareBookNode(node: RawBookNode, index: number, importedAt: string, root?: string) {
  const prepared = createPreparedDesktopTextImport({
    content: node.content,
    degradedReason: node.degradedReason,
    fileName: `chapter-${index + 1}.xhtml`,
    filePath: `epub-chapter#${node.key}`,
    importedAt,
    kind: 'epub',
    managedEpubImageDestinations: node.embeddedImages.map((image) => image.destination),
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  const result = {
    content: prepared.content,
    degradedReason: prepared.degradedReason,
    embeddedImages: node.embeddedImages,
    hideTitleHeading: prepared.hideTitleHeading,
    key: node.key,
    parentKey: node.parentKey,
    title: node.title
  } satisfies PreparedBookNode;
  return root ? stageEpubText(result, ['content'], root) : result;
}

function buildRootContent(title: string, body: string) {
  const trimmedBody = body.trim();
  return trimmedBody ? `# ${title}\n\n${trimmedBody}` : `# ${title}`;
}

async function syncBookNodes(parentNodeId: string, sourceFingerprint: string, importedAt: string, nodes: PreparedBookNode[], root?: string) {
  const connection = openDatabaseConnection();
  const nodeIdsByKey = new Map<string, string>();

  connection.driver.transaction((driver) => {
    nodes.forEach((node) => {
      const nodeId = createEpubGeneratedNodeId(
        createHash('sha256').update(`${sourceFingerprint}\u001f${node.key}`).digest('hex')
      );
      nodeIdsByKey.set(node.key, nodeId);
      upsertNodeSnapshot(driver, {
        anchorLink: null,
        content: node.content,
        createdAt: importedAt,
        hideTitleHeading: node.hideTitleHeading,
        isTitleManual: true,
        kind: 'topic',
        nodeId,
        parentNodeId: node.parentKey ? (nodeIdsByKey.get(node.parentKey) ?? parentNodeId) : parentNodeId,
        position: null,
        reveal: null,
        title: node.title,
        updatedAt: importedAt
      });
    });
  });

  const finalizedNodes: PreparedBookNode[] = [];
  for (const node of nodes) {
    const nodeId = nodeIdsByKey.get(node.key);
    if (!nodeId) {
      finalizedNodes.push(node);
      continue;
    }
    const finalized = await importEmbeddedImagesForNode(nodeId, importedAt, node);
    finalizedNodes.push(root ? stageEpubText(finalized, ['content'], root) : finalized);
  }
  return { finalizedNodes, nodeIdsByKey };
}

export async function loadEpubPreview(source: ImportSourceDescriptor) {
  const book = await readRawEpubBook(source);
  try {
    const importedAt = new Date().toISOString();
    const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt, book.workingDirectory));
    return [buildRootContent(book.title, book.rootContent), ...nodes.map((node) => node.content)].join('\n\n').trim();
  } finally { await book.dispose?.(); }
}

export async function runEpubImport(source: ImportSourceDescriptor, importedAt: string, options?: EpubImportOptions) {
  const book = await readRawEpubBook(source);
  try {
    const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt, book.workingDirectory));
    const rootNode = createPreparedDesktopTextImport({
      content: buildRootContent(book.title, book.rootContent),
      degradedReason: book.rootDegradedReason,
      fileName: source.sourceName,
      filePath: source.filePath,
      importedAt,
      kind: 'epub',
      managedEpubImageDestinations: book.rootEmbeddedImages.map((image) => image.destination),
      ...(options?.sourceIdentity === undefined ? {} : { sourceIdentity: options.sourceIdentity }),
      sourceTrackingMode: options?.sourceTrackingMode ?? 'untracked',
      sourceProfile: 'epub',
      titleStrategy: 'heading'
    });
    if (options?.targetNodeId) {
      ensureTrackedImportTarget(rootNode, options.targetNodeId);
    }
    const imported = runPreparedImport(rootNode);
    if (!imported.nodeId) {
      throw new Error('EPUB import failed: parent node was not created');
    }

    const finalizedRoot = await importEmbeddedImagesForNode(imported.nodeId, importedAt, {
      content: rootNode.content,
      degradedReason: rootNode.degradedReason,
      embeddedImages: book.rootEmbeddedImages,
      title: rootNode.nodeTitle
    });
    const { finalizedNodes, nodeIdsByKey } = await syncBookNodes(imported.nodeId, imported.sourceFingerprint, importedAt, nodes, book.workingDirectory);
    if (options?.sequentialReadingMode) {
      const connection = openDatabaseConnection();
      applyEpubSequentialReadingMode({
        driver: connection.driver,
        importedAt,
        mode: options.sequentialReadingMode,
        nodeIds: [...nodeIdsByKey.values()],
        sourceNodeId: imported.nodeId
      });
    }
    persistImportedOpeningTexts({
      finalizedNodes,
      finalizedRoot,
      nodeIdsByKey,
      rootNodeId: imported.nodeId,
      rootTitle: rootNode.nodeTitle
    });
    const aggregateReason = finalizedNodes.reduce<string | null>(
      (reason, node) => appendReason(reason, node.degradedReason),
      appendReason(imported.degradedReason, finalizedRoot.degradedReason)
    );
    return applyAggregateDegrade(imported, aggregateReason);
  } finally { await book.dispose?.(); }
}
