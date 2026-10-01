import { createHash } from 'node:crypto';

import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type {
  PreparedReadwiseApiAnnotation,
  PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';
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
    const stored = openDatabaseConnection().driver.queryOne<NodeBodyRow & { anchor_link: string | null }>(
      `SELECT n.anchor_link, n.content, n.body_blob_hash, cbd.data AS body_blob_data FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ? AND n.deleted_at IS NULL`, [state.nodeId]
    );
    if (!stored) continue;
    const row = { ...stored, content: requireResolvedNodeBody(stored, state.nodeId).content };
    if (!row.content.trim()) continue;
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

export function buildLocalReadwiseOriginalEpubDocument(
  target: ReadwiseOriginalEpubTarget
): PreparedReadwiseApiDocument {
  const metadata = target.state.metadata;
  return {
    annotations: mergeRetainedReadwiseAnnotations(target, []),
    body: '',
    category: 'epub',
    coverImageUrl: null,
    createdAt: null,
    degradedReason: null,
    id: target.documentId,
    metadata: {
      ...metadata,
      author: typeof metadata.author === 'string' ? metadata.author : null,
      category: 'epub',
      readerUrl: typeof metadata.readerUrl === 'string' ? metadata.readerUrl : null,
      sourceUrl: typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : null,
      title: target.title
    },
    title: target.title,
    unmatchedAnnotationCount: 0,
    updatedAt: target.state.sourceUpdatedAt
  };
}
