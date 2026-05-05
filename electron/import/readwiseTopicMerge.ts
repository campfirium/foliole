import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { collectAnchoredImportedHighlights } from '../../lib/core/database/importHighlightAnchors.js';
import { resolveReadwiseHighlightUpdate } from '../../lib/core/database/importReadwiseHighlightUpdates.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeMergeReadwiseTopicHighlightsResult } from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveImportKind } from '../ipc/importSourcePipeline.js';
import { selectImportFilePath } from '../ipc/importTextFile.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { loadImportManagerSettings } from './importManagerSettings.js';

interface SourceNodeRow extends DatabaseRow {
  content: string;
  kind: string;
  source_kind: string | null;
  source_locator: string | null;
  source_name: string | null;
  title: string;
}

function normalizeHighlightContent(content: string) {
  return content.replace(/\r\n?/g, '\n').trim();
}

function readSourceNode(nodeId: string) {
  return (
    openDatabaseConnection().driver.queryOne<SourceNodeRow>(
      `SELECT content,
              title,
              kind,
              import_sources.source_kind,
              import_sources.source_locator,
              import_sources.source_name
       FROM nodes
       LEFT JOIN import_sources
         ON import_sources.latest_node_id = nodes.id
       WHERE nodes.id = ?`,
      [nodeId]
    ) ?? null
  );
}

function readExistingChildHighlightContents(nodeId: string) {
  return openDatabaseConnection().driver
    .queryAll<{ content: string }>(
      `SELECT content
       FROM nodes
       WHERE parent_id = ?
         AND anchor_link IS NOT NULL
         AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [nodeId]
    )
    .map((row) => row.content);
}

function readExistingUnmatchedHighlightContents(sourceContent: string) {
  const marker = '\n\n## Unmatched Sidecar Highlights\n\n';
  const markerIndex = sourceContent.indexOf(marker);
  if (markerIndex < 0) {
    return [];
  }
  return sourceContent
    .slice(markerIndex + marker.length)
    .split('\n')
    .map((line) => /^-\s+[^:]+:\s*(.+?)\s*$/.exec(line)?.[1] ?? '')
    .filter(Boolean);
}

function readExistingHighlightContents(nodeId: string, sourceContent: string) {
  return Array.from(
    new Set([
      ...readExistingChildHighlightContents(nodeId),
      ...collectAnchoredImportedHighlights(sourceContent).map((highlight) => highlight.content),
      ...readExistingUnmatchedHighlightContents(sourceContent)
    ])
  );
}

function readNextNodePosition() {
  const row = openDatabaseConnection().driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return typeof row?.position === 'number' ? row.position + 1 : 0;
}

function resolveSourceKind(sourceNode: SourceNodeRow, highlightFilePath: string) {
  try {
    return resolveImportKind(highlightFilePath);
  } catch {
    return sourceNode.source_kind === 'epub' ||
      sourceNode.source_kind === 'html' ||
      sourceNode.source_kind === 'markdown' ||
      sourceNode.source_kind === 'pdf' ||
      sourceNode.source_kind === 'text'
      ? sourceNode.source_kind
      : 'markdown';
  }
}

function createPreparedManualHighlightMerge(
  sourceNodeId: string,
  sourceNode: SourceNodeRow,
  highlightFilePath: string,
  highlightSidecar: Array<{ text: string }>
) {
  return createPreparedDesktopTextImport({
    content: sourceNode.content,
    fileName: sourceNode.source_name?.trim() || `${sourceNode.title.trim() || 'Topic'}.md`,
    filePath: sourceNode.source_locator?.trim() || `/manual/${sourceNodeId}.md`,
    highlightSidecar,
    importedAt: new Date().toISOString(),
    kind: resolveSourceKind(sourceNode, highlightFilePath),
    sourceProfile: 'body_with_highlight_sidecar',
    sourceTrackingMode: 'untracked'
  });
}

async function loadManualHighlightSidecar(highlightFilePath: string) {
  const highlightMarkdown = await fs.readFile(highlightFilePath, 'utf8');
  return extractReadwiseSidecarHighlights(highlightMarkdown, loadImportManagerSettings().readwiseReaderConfig);
}

async function selectHighlightFilePath(window?: BrowserWindow | null) {
  const selectedPath = await selectImportFilePath(window);
  return selectedPath?.trim() ? path.normalize(selectedPath.trim()) : null;
}

function persistMergedHighlights(input: {
  importedAt: string;
  nodeId: string;
  sourceTitle: string;
  update: ReturnType<typeof resolveReadwiseHighlightUpdate>;
}) {
  const connection = openDatabaseConnection();
  connection.driver.transaction(() => {
    const bodyBlobHash = upsertTextBodyBlob(connection.driver, input.update.content, input.importedAt);
    connection.driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ? WHERE id = ?', [
      input.update.content,
      bodyBlobHash,
      resolveNodeOpeningText(input.update.content, input.sourceTitle),
      input.importedAt,
      input.nodeId
    ]);
    if (input.update.highlights.length > 0) {
      insertImportedHighlightNodes({
        driver: connection.driver,
        highlights: input.update.highlights,
        importedAt: input.importedAt,
        parentNodeId: input.nodeId,
        parentContent: input.update.content,
        startPosition: readNextNodePosition()
      });
    }
    syncWorkspaceSearchIndexForNodeIds(connection.driver, [input.nodeId]);
  });
}

export async function mergeReadwiseTopicHighlightsFromFile(
  nodeId: string,
  highlightFilePath: string
): Promise<NativeMergeReadwiseTopicHighlightsResult> {
  const normalizedHighlightFilePath = highlightFilePath.trim();
  if (!normalizedHighlightFilePath) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }

  const sourceNode = readSourceNode(nodeId);
  if (!sourceNode || sourceNode.kind !== 'topic') {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'error' };
  }

  const existingHighlightContentSet = new Set(
    readExistingHighlightContents(nodeId, sourceNode.content)
      .map((content) => normalizeHighlightContent(content))
      .filter(Boolean)
  );
  const highlightSidecar = (await loadManualHighlightSidecar(normalizedHighlightFilePath)).filter((highlight) => {
    const normalized = normalizeHighlightContent(highlight.text);
    return normalized.length > 0 && !existingHighlightContentSet.has(normalized);
  });
  if (highlightSidecar.length === 0) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }

  const importedAt = new Date().toISOString();
  const prepared = createPreparedManualHighlightMerge(nodeId, sourceNode, normalizedHighlightFilePath, highlightSidecar);
  const readwiseUpdate = resolveReadwiseHighlightUpdate({
    existingChildContents: readExistingHighlightContents(nodeId, sourceNode.content),
    existingContent: sourceNode.content,
    prepared
  });
  if (readwiseUpdate.highlights.length === 0 && readwiseUpdate.content === sourceNode.content) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }

  persistMergedHighlights({
    importedAt,
    nodeId,
    sourceTitle: sourceNode.title,
    update: readwiseUpdate
  });

  scheduleMirrorSync([nodeId]);
  return {
    merged_highlight_count: readwiseUpdate.highlights.length,
    node_id: nodeId,
    status: 'merged'
  };
}

export async function mergeReadwiseTopicHighlights(
  nodeId: string,
  window?: BrowserWindow | null
): Promise<NativeMergeReadwiseTopicHighlightsResult> {
  const highlightFilePath = await selectHighlightFilePath(window);
  if (!highlightFilePath) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }
  return mergeReadwiseTopicHighlightsFromFile(nodeId, highlightFilePath);
}
