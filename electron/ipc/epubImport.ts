import { createHash } from 'node:crypto';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type { PersistedImportRecord, PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { importImageAttachmentBytes } from '../attachments/importImageAttachmentBytes.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';

import { readRawEpubBook } from './epubImportBook.js';
import { persistImportedOpeningTexts } from './epubImportOpeningText.js';
import { ensureTrackedImportTarget } from './epubImportTracking.js';
import { type RawBookNode } from './epubImportTree.js';
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

interface PreparedImportNodeContent {
  content: string;
  degradedReason: string | null;
  embeddedImages: PreparedImportEmbeddedImage[];
  title: string;
}

interface EpubImportOptions {
  sourceIdentity?: string;
  sourceTrackingMode?: 'tracked' | 'untracked';
  targetNodeId?: string;
}

function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  if (!current) return next;
  return current.includes(next) ? current : `${current}; ${next}`;
}

function createChapterNodeId(sourceFingerprint: string, chapterKey: string) {
  return `node-epub-${createHash('sha256').update(`${sourceFingerprint}\u001f${chapterKey}`).digest('hex').slice(0, 24)}`;
}

function prepareBookNode(node: RawBookNode, index: number, importedAt: string) {
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
  return {
    content: prepared.content,
    degradedReason: prepared.degradedReason,
    embeddedImages: node.embeddedImages,
    hideTitleHeading: prepared.hideTitleHeading,
    key: node.key,
    parentKey: node.parentKey,
    title: node.title
  } satisfies PreparedBookNode;
}

function buildRootContent(title: string, body: string) {
  const trimmedBody = body.trim();
  return trimmedBody ? `# ${title}\n\n${trimmedBody}` : `# ${title}`;
}

async function importEmbeddedImagesForNode<T extends PreparedImportNodeContent>(nodeId: string, importedAt: string, node: T) {
  if (node.embeddedImages.length === 0) {
    return node;
  }

  const imagesByDestination = new Map(node.embeddedImages.map((image) => [image.destination, image] as const));
  const degradedMessages: string[] = [];
  let rewrittenContent = '';
  let previousEnd = 0;

  for (const reference of collectMarkdownImageReferences(node.content)) {
    rewrittenContent += node.content.slice(previousEnd, reference.start);
    previousEnd = reference.end;

    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    const image = parsedTarget ? imagesByDestination.get(parsedTarget.destination) : null;
    if (!parsedTarget || !image) {
      rewrittenContent += reference.fullMatch;
      continue;
    }

    const importedImage = await importImageAttachmentBytes({
      bytes: image.bytes,
      errorSource: image.destination,
      mimeType: image.mimeType,
      nodeId,
      originalName: image.originalName
    });
    if (importedImage.status === 'error') {
      degradedMessages.push(importedImage.message);
      rewrittenContent += `[${importedImage.message}]`;
      continue;
    }

    const suffix = parsedTarget.suffix ? ` ${parsedTarget.suffix}` : '';
    rewrittenContent += `![${reference.altText}](${buildAssetMarkdownUrl(importedImage.attachment_id, importedImage.original_name)}${suffix})`;
  }

  rewrittenContent += node.content.slice(previousEnd);
  if (rewrittenContent === node.content && degradedMessages.length === 0) {
    return node;
  }

  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, rewrittenContent, importedAt);
  connection.driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ? WHERE id = ?', [
    rewrittenContent,
    bodyBlobHash,
    resolveNodeOpeningText(rewrittenContent, node.title),
    importedAt,
    nodeId
  ]);
  syncWorkspaceSearchIndexForNodeIds(connection.driver, [nodeId]);

  return {
    ...node,
    content: rewrittenContent,
    degradedReason: degradedMessages.reduce<string | null>(
      (reason, message) => appendReason(reason, message),
      node.degradedReason
    )
  };
}

async function syncBookNodes(parentNodeId: string, sourceFingerprint: string, importedAt: string, nodes: PreparedBookNode[]) {
  const connection = openDatabaseConnection();
  const firstPosition = (connection.driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order')?.position ?? -1) + 1;
  const nodeIdsByKey = new Map<string, string>();

  connection.driver.transaction((driver) => {
    nodes.forEach((node, index) => {
      const nodeId = createChapterNodeId(sourceFingerprint, node.key);
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
        position: firstPosition + index,
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
    finalizedNodes.push(await importEmbeddedImagesForNode(nodeId, importedAt, node));
  }
  return { finalizedNodes, nodeIdsByKey };
}

function applyAggregateDegrade(record: PersistedImportRecord, degradedReason: string | null) {
  if (!degradedReason || !record.nodeId) return record;
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);
  return { ...record, degradedReason, resultStatus: 'degraded' as const };
}

export async function loadEpubPreview(source: ImportSourceDescriptor) {
  const book = await readRawEpubBook(source);
  const importedAt = new Date().toISOString();
  const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt));
  return [buildRootContent(book.title, book.rootContent), ...nodes.map((node) => node.content)].join('\n\n').trim();
}

export async function runEpubImport(source: ImportSourceDescriptor, importedAt: string, options?: EpubImportOptions) {
  const book = await readRawEpubBook(source);
  const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt));
  const rootNode = createPreparedDesktopTextImport({
    content: buildRootContent(book.title, book.rootContent),
    degradedReason: book.rootDegradedReason,
    fileName: source.sourceName,
    filePath: source.filePath,
    importedAt,
    kind: 'epub',
    managedEpubImageDestinations: book.rootEmbeddedImages.map((image) => image.destination),
    sourceIdentity: options?.sourceIdentity,
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
  const { finalizedNodes, nodeIdsByKey } = await syncBookNodes(imported.nodeId, imported.sourceFingerprint, importedAt, nodes);
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
}
