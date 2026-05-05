import { createHash } from 'node:crypto';

import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { openDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';

import { readRawEpubBook } from './epubImportBook.js';
import { type RawBookNode } from './epubImportTree.js';
import { type ImportSourceDescriptor } from './importSourcePipeline.js';

interface PreparedBookNode {
  content: string;
  degradedReason: string | null;
  hideTitleHeading: boolean;
  key: string;
  parentKey: string | null;
  title: string;
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
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  return {
    content: prepared.content,
    degradedReason: prepared.degradedReason,
    hideTitleHeading: prepared.hideTitleHeading,
    key: node.key,
    parentKey: node.parentKey,
    title: node.title
  } satisfies PreparedBookNode;
}

function syncBookNodes(parentNodeId: string, sourceFingerprint: string, importedAt: string, nodes: PreparedBookNode[]) {
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
  return ['# ' + book.title, ...nodes.flatMap((node) => ['', node.content])].join('\n').trim();
}

export async function runEpubImport(source: ImportSourceDescriptor, importedAt: string) {
  const book = await readRawEpubBook(source);
  const nodes = book.nodes.map((node, index) => prepareBookNode(node, index, importedAt));
  const summary = createPreparedDesktopTextImport({
    content: ['# ' + book.title, '', ...nodes.map((node) => `- ${node.title}`)].join('\n'),
    fileName: source.sourceName,
    filePath: source.filePath,
    importedAt,
    kind: 'epub',
    sourceProfile: 'epub',
    titleStrategy: 'heading'
  });
  const imported = runPreparedImport(summary);
  if (!imported.nodeId) {
    throw new Error('EPUB import failed: parent node was not created');
  }

  syncBookNodes(imported.nodeId, imported.sourceFingerprint, importedAt, nodes);
  const aggregateReason = nodes.reduce<string | null>((reason, node) => appendReason(reason, node.degradedReason), imported.degradedReason);
  return applyAggregateDegrade(imported, aggregateReason);
}
