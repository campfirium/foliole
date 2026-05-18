import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver,
  type RunPreparedImportOptions
} from '../../lib/core/database/index.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';

import { createNodeAttachmentLink } from './attachments.js';
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

function readImportNodeContent(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ content: string; title: string }>(
    `SELECT content, title
     FROM nodes
     WHERE id = ? AND deleted_at IS NULL`,
    [nodeId]
  ) ?? null;
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
  const persistedNode = readImportNodeContent(nodeId);
  const currentContent = persistedNode?.content ?? prepared.content;
  const degradedMessages: string[] = [];
  const rewrittenContent = rewriteInlineImageReferences(currentContent, (reference) => {
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

  if (rewrittenContent === currentContent && degradedMessages.length === 0) {
    return record;
  }

  const connection = openDatabaseConnection();
  applyParentContentChange({
    driver: connection.driver,
    nextContent: rewrittenContent,
    nodeId,
    previousContent: currentContent,
    title: persistedNode?.title ?? prepared.nodeTitle,
    updatedAt: record.importedAt
  });

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

function linkPreparedLocalizedImages(record: PersistedImportRecord, prepared: PreparedImportRecord) {
  if (!record.nodeId || !prepared.localizedImageAttachmentIds?.length) {
    return;
  }
  Array.from(new Set(prepared.localizedImageAttachmentIds)).forEach((attachmentId) => {
    createNodeAttachmentLink({ attachmentId, nodeId: record.nodeId as string, role: 'image' });
  });
}

export function runPreparedImport(input: PreparedImportRecord, options?: RunPreparedImportOptions) {
  const record = rewriteMarkdownLocalImages(runPreparedImportViaDriver(openDatabaseConnection().driver, input, options), input);
  linkPreparedLocalizedImages(record, input);
  if (input.sourceKind !== 'pdf' || !record.nodeId || record.resultStatus === 'failed') {
    return record;
  }

  importPdfSourceAttachment(record.nodeId, input.sourceLocator);
  return record;
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  return recordPreparedImportFailureViaDriver(openDatabaseConnection().driver, input, failureReason);
}
