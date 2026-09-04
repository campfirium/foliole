import fs from 'node:fs/promises';
import path from 'node:path';

import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';
import { readKeepImportItem } from '../database/keepImportItems.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';
import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { loadPendingIncomingUpdate } from './incomingUpdates.js';
import { loadPreparedKeepImportRecord, resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

interface SourceNodeRow extends NodeBodyRow {
  content: string;
  id: string;
  updated_at: string;
}

export interface NodeSourceUpdatePreview {
  checked_at: string;
  current_highlight_count: number;
  current_content: string;
  incoming_update_id?: string;
  kind?: 'incoming_update' | 'source_update';
  source_node_id: string;
  updated_highlight_count: number;
  updated_content: string;
}

function readSourceNode(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<SourceNodeRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data, n.updated_at
     FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  return row ? { ...row, content: requireResolvedNodeBody(row, row.id).content } : undefined;
}

function countCurrentHighlights(nodeId: string) {
  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM nodes
       WHERE parent_id = ?
         AND anchor_link IS NOT NULL
         AND deleted_at IS NULL`
    )
    .get(nodeId) as { count: number } | undefined;
  return row?.count ?? 0;
}

function normalizeComparableContent(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n').trim();
  return normalized;
}

export function normalizeNodeSourcePreviewContent(content: string) {
  return content.replace(/\r\n?/g, '\n');
}

function loadIncomingUpdatePreview(nodeId: string): NodeSourceUpdatePreview | null {
  const incomingUpdate = loadPendingIncomingUpdate(nodeId);
  if (!incomingUpdate) {
    return null;
  }
  const sourceNode = readSourceNode(nodeId);
  if (!sourceNode) {
    return null;
  }
  return {
    checked_at: incomingUpdate.updatedAt,
    current_highlight_count: countCurrentHighlights(sourceNode.id),
    current_content: normalizeNodeSourcePreviewContent(sourceNode.content),
    incoming_update_id: incomingUpdate.id,
    kind: 'incoming_update',
    source_node_id: sourceNode.id,
    updated_highlight_count: 0,
    updated_content: normalizeNodeSourcePreviewContent(incomingUpdate.updatedContent)
  };
}

function resolveRuleConfig(ruleId: string) {
  const settings = loadImportManagerSettings();
  const readwiseRule = settings.readwiseSources.find((entry) => entry.id === ruleId);
  if (readwiseRule?.primaryPath.trim()) {
    return {
      config: {
        directoryPath: readwiseRule.primaryPath.trim(),
        highlightPolicy: 'reference_only',
        ruleId,
        sourceType: 'readwise'
      } satisfies KeepImportRuleConfig,
      primaryPath: readwiseRule.primaryPath.trim()
    };
  }
  const genericRule = settings.sources.find((entry) => entry.id === ruleId);
  if (!genericRule?.primaryPath.trim()) {
    return null;
  }
  return {
    config: {
      directoryPath: genericRule.primaryPath.trim(),
      highlightPolicy: genericRule.highlightMode === 'merged' ? 'adopt' : 'reference_only',
      ruleId,
      sourceType: 'generic'
    } satisfies KeepImportRuleConfig,
    primaryPath: genericRule.primaryPath.trim()
  };
}

async function buildSourceDescriptor(primaryPath: string, sourcePath: string): Promise<DirectoryImportSourceDescriptor | null> {
  const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(primaryPath, sourcePath);
  try {
    const stats = await fs.stat(filePath);
    const kind = resolveImportKind(filePath);
    return {
      adapterId: kind === 'html' ? 'html_directory' : kind === 'text' ? 'text_directory' : 'markdown_directory',
      filePath,
      kind,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
      sourceName: path.isAbsolute(sourcePath) ? path.basename(sourcePath) : sourcePath
    };
  } catch {
    return null;
  }
}

function hasSourceSignatureChanged(
  keepImportItem: NonNullable<ReturnType<typeof readKeepImportItem>>,
  sourceSignature: Awaited<ReturnType<typeof resolveKeepImportSourceSignature>>
) {
  return (
    keepImportItem.source_mtime_ms !== sourceSignature.primary.mtimeMs ||
    keepImportItem.source_size_bytes !== sourceSignature.primary.sizeBytes ||
    (keepImportItem.highlight_source_mtime_ms ?? null) !== (sourceSignature.highlight?.mtimeMs ?? null) ||
    (keepImportItem.highlight_source_size_bytes ?? null) !== (sourceSignature.highlight?.sizeBytes ?? null)
  );
}

function shouldExposeReadwiseUpdate(input: {
  comparableCurrentContent: string;
  comparablePreparedContent: string;
  keepImportItem: NonNullable<ReturnType<typeof readKeepImportItem>>;
  preparedContentFingerprint: string;
  sourceNode: SourceNodeRow;
  sourceSignatureChanged: boolean;
  storedSourceFingerprint: string | undefined;
}) {
  if (input.comparableCurrentContent === input.comparablePreparedContent) {
    return false;
  }
  if (input.keepImportItem.has_source_update) {
    return true;
  }
  if (input.sourceSignatureChanged) {
    return true;
  }
  return (
    input.storedSourceFingerprint === input.preparedContentFingerprint &&
    input.keepImportItem.last_imported_at !== null &&
    input.sourceNode.updated_at === input.keepImportItem.last_imported_at
  );
}

export async function loadNodeSourceUpdatePreview(nodeId: string): Promise<NodeSourceUpdatePreview | null> {
  const incomingPreview = loadIncomingUpdatePreview(nodeId);
  if (incomingPreview) {
    return incomingPreview;
  }

  const sourceDetails = loadNodeSourceDetails(nodeId);
  if (!sourceDetails || sourceDetails.sourceNodeId !== nodeId || !sourceDetails.keepImportItem) {
    return null;
  }

  const keepImportItem = readKeepImportItem(sourceDetails.keepImportItem.rule_id, sourceDetails.keepImportItem.source_path);
  if (!keepImportItem || !keepImportItem.has_source_update) {
    return null;
  }
  const sourceNode = readSourceNode(sourceDetails.sourceNodeId);
  if (!sourceNode) {
    return null;
  }
  const rule = resolveRuleConfig(keepImportItem.rule_id);
  if (!rule) {
    return null;
  }
  const source = await buildSourceDescriptor(rule.primaryPath, keepImportItem.source_path);
  if (!source) {
    return null;
  }

  const checkedAt = new Date().toISOString();
  const [prepared, sourceSignature] = await Promise.all([
    loadPreparedKeepImportRecord(rule.config, source, checkedAt),
    resolveKeepImportSourceSignature(rule.config, source)
  ]);
  const comparableCurrentContent = normalizeComparableContent(sourceNode.content);
  const comparablePreparedContent = normalizeComparableContent(prepared.content);
  const sourceSignatureChanged = hasSourceSignatureChanged(keepImportItem, sourceSignature);
  const hasUpdate =
    prepared.sourceProfile === 'body_with_highlight_sidecar'
      ? shouldExposeReadwiseUpdate({
          comparableCurrentContent,
          comparablePreparedContent,
          keepImportItem,
          preparedContentFingerprint: prepared.contentFingerprint,
          sourceNode,
          sourceSignatureChanged,
          storedSourceFingerprint: sourceDetails.importSource?.last_content_fingerprint
        })
      : comparableCurrentContent !== comparablePreparedContent && (sourceSignatureChanged || Boolean(keepImportItem.has_source_update));

  if (!hasUpdate) {
    return null;
  }

  return {
    checked_at: checkedAt,
    current_highlight_count: countCurrentHighlights(sourceNode.id),
    current_content: normalizeNodeSourcePreviewContent(sourceNode.content),
    kind: 'source_update',
    source_node_id: sourceNode.id,
    updated_highlight_count: prepared.matchedHighlights?.length ?? 0,
    updated_content: normalizeNodeSourcePreviewContent(prepared.content)
  };
}
