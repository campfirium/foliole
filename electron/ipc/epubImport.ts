import { createHash } from 'node:crypto';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { prepareEpubBookNode, buildEpubRootContent, type PreparedBookNode } from '../../lib/core/import/epub/epubPreparedBook.js';
import { createEpubGeneratedNodeId } from '../../lib/core/import/epubGeneratedNodeIdentity.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
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

interface EpubImportOptions {
  sequentialReadingMode?: 'free' | 'sequential';
  sourceIdentity?: string;
  sourceTrackingMode?: 'tracked' | 'untracked';
  targetNodeId?: string;
}

function prepareBookNode(node: RawBookNode, index: number, importedAt: string, root?: string) {
  const prepared = prepareEpubBookNode(node, index, importedAt);
  return root ? stageEpubText(prepared, ['content'], root) : prepared;
}

function createBookNodes(
  parentNodeId: string,
  sourceFingerprint: string,
  importedAt: string,
  nodes: PreparedBookNode[]
) {
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

  return nodeIdsByKey;
}

async function finalizeBookNodes(
  nodes: PreparedBookNode[],
  nodeIdsByKey: Map<string, string>,
  importedAt: string,
  root?: string
) {
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
  return finalizedNodes;
}

export async function loadEpubPreview(source: ImportSourceDescriptor) {
  const book = await readRawEpubBook(source);
  try {
    const importedAt = new Date().toISOString();
    const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt, book.workingDirectory));
    return [buildEpubRootContent(book.title, book.rootContent), ...nodes.map((node) => node.content)].join('\n\n').trim();
  } finally { await book.dispose?.(); }
}

export async function runEpubImport(source: ImportSourceDescriptor, importedAt: string, options?: EpubImportOptions) {
  const book = await readRawEpubBook(source);
  try {
    const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt, book.workingDirectory));
    const rootNode = createPreparedDesktopTextImport({
      content: buildEpubRootContent(book.title, book.rootContent),
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
    const { imported, nodeId, nodeIdsByKey } = await runWithDatabaseConnectionOwner(() => {
      if (options?.targetNodeId) ensureTrackedImportTarget(rootNode, options.targetNodeId);
      const imported = runPreparedImport(rootNode);
      const nodeId = imported.nodeId;
      if (!nodeId) throw new Error('EPUB import failed: parent node was not created');
      return { imported, nodeId, nodeIdsByKey: createBookNodes(
        nodeId, imported.sourceFingerprint, importedAt, nodes) };
    });
    const finalizedRoot = await importEmbeddedImagesForNode(nodeId, importedAt, {
      content: rootNode.content, degradedReason: rootNode.degradedReason,
      embeddedImages: book.rootEmbeddedImages, title: rootNode.nodeTitle
    });
    const finalizedNodes = await finalizeBookNodes(
      nodes, nodeIdsByKey, importedAt, book.workingDirectory);
    return runWithDatabaseConnectionOwner(() => {
      if (options?.sequentialReadingMode) {
        applyEpubSequentialReadingMode({
          driver: openDatabaseConnection().driver, importedAt, mode: options.sequentialReadingMode,
          nodeIds: [...nodeIdsByKey.values()], sourceNodeId: nodeId
        });
      }
      persistImportedOpeningTexts({ finalizedNodes, finalizedRoot, nodeIdsByKey,
        rootNodeId: nodeId, rootTitle: rootNode.nodeTitle });
      const aggregateReason = finalizedNodes.reduce<string | null>(
        (reason, node) => appendReason(reason, node.degradedReason),
        appendReason(imported.degradedReason, finalizedRoot.degradedReason)
      );
      return applyAggregateDegrade(imported, aggregateReason);
    });
  } finally { await book.dispose?.(); }
}
