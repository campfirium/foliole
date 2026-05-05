import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver
} from '../../lib/core/database/index.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';

import { openDatabaseConnection } from './connection.js';
import { importMarkdownImageAttachment, importPdfSourceAttachment } from './importPipelineAttachments.js';
import { rewriteInlineImageReferences } from './inlineImageReferences.js';

export type { PersistedImportRecord, PreparedImportRecord };

function appendDegradedReason(currentReason: string | null, nextReason: string | null) {
  if (!nextReason) {
    return currentReason;
  }
  if (!currentReason) {
    return nextReason;
  }
  return `${currentReason}; ${nextReason}`;
}

function rewriteMarkdownLocalImages(record: PersistedImportRecord, prepared: PreparedImportRecord) {
  if (
    prepared.sourceKind !== 'markdown' ||
    !record.nodeId ||
    record.duplicateSemantic === 'duplicate' ||
    prepared.content.trim().length === 0
  ) {
    return record;
  }

  const nodeId = record.nodeId;
  const degradedMessages: string[] = [];
  const rewrittenContent = rewriteInlineImageReferences(prepared.content, (reference) => {
    const importResult = importMarkdownImageAttachment({
      destination: reference.destination,
      nodeId,
      sourceLocator: prepared.sourceLocator,
      syntax: reference.syntax
    });
    if (importResult.status === 'skipped') {
      return reference.fullMatch;
    }
    if (importResult.status === 'error') {
      degradedMessages.push(importResult.message);
      return `[${importResult.message}]`;
    }

    const suffix = reference.suffix ? ` ${reference.suffix}` : '';
    return `![${reference.altText}](${buildAssetMarkdownUrl(importResult.attachmentId, importResult.originalName)}${suffix})`;
  });

  if (rewrittenContent === prepared.content && degradedMessages.length === 0) {
    return record;
  }

  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, rewrittenContent, record.importedAt);
  connection.driver.execute('UPDATE nodes SET content = ?, body_blob_hash = ?, opening_text = ?, updated_at = ? WHERE id = ?', [
    rewrittenContent,
    bodyBlobHash,
    resolveNodeOpeningText(rewrittenContent, prepared.nodeTitle),
    record.importedAt,
    nodeId
  ]);
  syncWorkspaceSearchIndexForNodeIds(connection.driver, [nodeId]);

  if (degradedMessages.length === 0) {
    return record;
  }

  const degradedReason = appendDegradedReason(
    record.degradedReason,
    `Markdown local image import degraded: ${degradedMessages.join(' | ')}`
  );

  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);

  return {
    ...record,
    degradedReason,
    resultStatus: 'degraded' as const
  };
}

export function runPreparedImport(input: PreparedImportRecord) {
  const record = rewriteMarkdownLocalImages(runPreparedImportViaDriver(openDatabaseConnection().driver, input), input);
  if (input.sourceKind !== 'pdf' || !record.nodeId || record.resultStatus === 'failed') {
    return record;
  }

  importPdfSourceAttachment(record.nodeId, input.sourceLocator);
  return record;
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  return recordPreparedImportFailureViaDriver(openDatabaseConnection().driver, input, failureReason);
}
