import { createHash } from 'node:crypto';

import type { PreparedReadwiseApiAnnotation } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseOriginalEpubTarget } from './readwiseOriginalEpubTarget.js';

function originalText(anchorLink: string | null, content: string) {
  try {
    const locator = JSON.parse(anchorLink ?? '{}') as { locator?: { originalText?: unknown } };
    const text = locator.locator?.originalText;
    return typeof text === 'string' && text.trim() ? text.trim() : content.trim();
  } catch {
    return content.trim();
  }
}

export function mergeRetainedReadwiseAnnotations(
  target: ReadwiseOriginalEpubTarget,
  remote: PreparedReadwiseApiAnnotation[]
) {
  const source = loadReadwiseApiImportSource(target.connectionRef, target.documentId);
  if (!source) throw new Error('original_epub_target_missing');
  const byRemoteId = new Map(remote.map((annotation) => [annotation.remoteId, annotation]));
  for (const state of source.state.annotations) {
    if (state.blockedAt || byRemoteId.has(state.remoteId)) continue;
    const row = openDatabaseConnection().driver.queryOne<{ anchor_link: string | null; content: string }>(
      'SELECT anchor_link, content FROM nodes WHERE id = ? AND deleted_at IS NULL', [state.nodeId]
    );
    if (!row?.content.trim()) continue;
    byRemoteId.set(state.remoteId, {
      content: row.content,
      contentHash: state.contentHash || createHash('sha256').update(row.content).digest('hex'),
      kind: state.kind,
      locatorText: originalText(row.anchor_link, row.content),
      parentRemoteId: state.parentRemoteId,
      remoteId: state.remoteId,
      updatedAt: state.sourceUpdatedAt
    });
  }
  return [...byRemoteId.values()];
}
