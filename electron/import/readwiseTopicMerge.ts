import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { insertImportedHighlightNodes } from '../../lib/core/database/importDerivedHighlights.js';
import { resolveReadwiseHighlightUpdate } from '../../lib/core/database/importReadwiseHighlightUpdates.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import type { ImportSidecarHighlight } from '../../lib/core/import/controlledContext.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { extractReadwiseSidecarHighlights } from '../../lib/core/import/readwiseReaderParsing.js';
import type { NativeMergeReadwiseTopicHighlightsResult } from '../../lib/platform/nativeContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { resolveImportKind } from '../ipc/importSourcePipeline.js';
import { selectImportFilePath } from '../ipc/importTextFile.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import { linkLocalizedImagesToNode } from './imageLocalizationContext.js';
import { loadImportManagerSettings } from './importManagerSettings.js';
import {
  filterNewHighlightSidecar,
  localizeReadwiseTopicMergeTexts
} from './readwiseTopicMergeLocalization.js';

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
         AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [nodeId]
    )
    .map((row) => row.content);
}

function readExistingHighlightContents(nodeId: string) {
  return Array.from(
    new Set(readExistingChildHighlightContents(nodeId))
  );
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
  highlightSidecar: ImportSidecarHighlight[]
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

async function prepareLocalizedManualHighlightMerge(input: {
  existingHighlightContentSet: Set<string>;
  highlightFilePath: string;
  nodeId: string;
  sourceNode: SourceNodeRow;
}) {
  const localized = await localizeReadwiseTopicMergeTexts(input.sourceNode.content, input.highlightFilePath);
  const localizedHighlightSidecar = filterNewHighlightSidecar(
    extractReadwiseSidecarHighlights(localized.highlightMarkdown, loadImportManagerSettings().readwiseReaderConfig),
    input.existingHighlightContentSet
  );
  return {
    localized,
    prepared: createPreparedManualHighlightMerge(
      input.nodeId,
      { ...input.sourceNode, content: localized.sourceContent },
      input.highlightFilePath,
      localizedHighlightSidecar
    )
  };
}

async function selectHighlightFilePath(window?: BrowserWindow | null) {
  const selectedPath = await selectImportFilePath(window);
  return selectedPath?.trim() ? path.normalize(selectedPath.trim()) : null;
}

function persistMergedHighlights(input: {
  importedAt: string;
  nodeId: string;
  previousContent: string;
  update: ReturnType<typeof resolveReadwiseHighlightUpdate>;
}) {
  const connection = openDatabaseConnection();
  connection.driver.transaction(() => {
    if (input.update.content !== input.previousContent) {
      applyParentContentChange({
        driver: connection.driver,
        nextContent: input.update.content,
        nodeId: input.nodeId,
        previousContent: input.previousContent,
        updatedAt: input.importedAt
      });
    }
    if (input.update.highlights.length > 0) {
      insertImportedHighlightNodes({
        driver: connection.driver,
        highlights: input.update.highlights,
        importedAt: input.importedAt,
        parentNodeId: input.nodeId,
        parentContent: input.update.content
      });
    }
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
    readExistingHighlightContents(nodeId)
      .map((content) => normalizeHighlightContent(content))
      .filter(Boolean)
  );
  const highlightSidecar = filterNewHighlightSidecar(
    await loadManualHighlightSidecar(normalizedHighlightFilePath),
    existingHighlightContentSet
  );
  if (highlightSidecar.length === 0) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }

  const importedAt = new Date().toISOString();
  const mergeInput = await prepareLocalizedManualHighlightMerge({
    existingHighlightContentSet,
    highlightFilePath: normalizedHighlightFilePath,
    nodeId,
    sourceNode
  });
  const readwiseUpdate = resolveReadwiseHighlightUpdate({
    existingChildContents: readExistingHighlightContents(nodeId),
    existingContent: mergeInput.localized.sourceContent,
    prepared: mergeInput.prepared
  });
  if (readwiseUpdate.highlights.length === 0 && readwiseUpdate.content === sourceNode.content) {
    return { merged_highlight_count: 0, node_id: nodeId, status: 'noop' };
  }

  persistMergedHighlights({
    importedAt,
    nodeId,
    previousContent: sourceNode.content,
    update: readwiseUpdate
  });
  linkLocalizedImagesToNode(nodeId, mergeInput.localized.attachmentIds);

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
