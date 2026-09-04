import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver,
  type RunPreparedImportOptions
} from '../../lib/core/database/index.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { normalizeSafeMarkdownDataImageUrl, parseMarkdownDataImageSize } from '../../lib/platform/markdownImageDataUrl.js';

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
  const row = openDatabaseConnection().driver.queryOne<NodeBodyRow & { id: string; title: string }>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data, n.title
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ? AND n.deleted_at IS NULL`,
    [nodeId]
  );
  if (!row) return null;
  return { content: requireResolvedNodeBody(row, row.id).content, title: row.title };
}

const SMALL_IMAGE_MAX_SIDE = 128;

function isSmallDataImageDestination(destination: string) {
  const size = parseMarkdownDataImageSize(destination);
  return Boolean(size && size.width <= SMALL_IMAGE_MAX_SIDE && size.height <= SMALL_IMAGE_MAX_SIDE);
}

function compactConsecutiveSmallDataImages(content: string) {
  let compacted = '';
  let cursor = 0;
  let previousWasSmallDataImage = false;

  for (const reference of collectMarkdownImageReferences(content)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    const isSmallDataImage = Boolean(parsedTarget && isSmallDataImageDestination(parsedTarget.destination));
    const gap = content.slice(cursor, reference.start);
    compacted += previousWasSmallDataImage && isSmallDataImage && gap.trim().length === 0 ? ' ' : gap;
    compacted += reference.fullMatch;
    cursor = reference.end;
    previousWasSmallDataImage = isSmallDataImage;
  }

  return `${compacted}${content.slice(cursor)}`;
}

function rewriteImportImageReferences(input: {
  content: string;
  degradedMessages: string[];
  nodeId: string;
  sourceLocator: string;
}) {
  return rewriteInlineImageReferences(input.content, (reference) => {
    const normalizedDataImageUrl = normalizeSafeMarkdownDataImageUrl(reference.destination);
    if (normalizedDataImageUrl) {
      const suffix = reference.suffix ? ` ${reference.suffix}` : '';
      return `![${reference.altText}](${normalizedDataImageUrl}${suffix})`;
    }

    const importResult = importMarkdownImageAttachment({
      destination: reference.destination,
      nodeId: input.nodeId,
      sourceLocator: input.sourceLocator,
      syntax: reference.syntax
    });
    if (importResult.status === 'skipped') {
      return reference.fullMatch;
    }
    if (importResult.status === 'error') {
      input.degradedMessages.push(importResult.message);
      return `[${importResult.message}]`;
    }

    const suffix = reference.suffix ? ` ${reference.suffix}` : '';
    return `![${reference.altText}](${buildAssetMarkdownUrl(importResult.attachmentId, importResult.originalName)}${suffix})`;
  });
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
  const rewrittenImagesContent = rewriteImportImageReferences({
    content: currentContent,
    degradedMessages,
    nodeId,
    sourceLocator: prepared.sourceLocator
  });
  const rewrittenContent = compactConsecutiveSmallDataImages(rewrittenImagesContent);

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
