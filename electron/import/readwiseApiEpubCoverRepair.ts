import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';
import { createNodeAttachmentLink } from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import { placeReadwiseApiEpubCover } from './readwiseApiEpubCoverBody.js';
import {
  fetchReadwiseRawSourceDocument,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { loadReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

export type ReadwiseApiEpubCoverRepairResult = {
  nodeId: string;
  status: 'no_cover_source' | 'repaired' | 'unchanged';
};

export interface ReadwiseApiEpubCoverRemote {
  category: string | null;
  id: string;
  imageUrl: string | null;
  title: string | null;
}

export async function repairReadwiseApiEpubCover(
  nodeId: string,
  dependencies: ReadwiseApiFetchDependencies = {}
): Promise<ReadwiseApiEpubCoverRepairResult> {
  const target = requireEpubTarget(nodeId);
  const before = requireSource(target.connectionRef, target.documentId);
  const remote = await fetchReadwiseRawSourceDocument(target.documentId, dependencies);
  if (!remote) throw new Error('readwise_cover_repair_source_missing');
  return repairPreparedTarget(target, before, remote);
}

export function repairReadwiseApiEpubCoverFromRemote(
  nodeId: string,
  remote: ReadwiseApiEpubCoverRemote
): Promise<ReadwiseApiEpubCoverRepairResult> {
  const target = requireEpubTarget(nodeId);
  if (remote.id !== target.documentId) throw new Error('readwise_cover_repair_source_mismatch');
  return repairPreparedTarget(
    target,
    requireSource(target.connectionRef, target.documentId),
    {
      author: null, category: remote.category === 'epub' ? 'epub' : null,
      htmlContent: null, id: remote.id, imageUrl: remote.imageUrl,
      notes: null, parentId: null, rawSourceUrl: null, sourceUrl: null,
      summary: null, title: remote.title, updatedAt: null, url: null
    }
  );
}

async function repairPreparedTarget(
  target: ReturnType<typeof requireEpubTarget>,
  before: ReturnType<typeof requireSource>,
  remote: NonNullable<Awaited<ReturnType<typeof fetchReadwiseRawSourceDocument>>>
) {
  if (remote.category !== 'epub') throw new Error('readwise_cover_repair_source_not_epub');
  if (!remote.imageUrl) return { nodeId: target.nodeId, status: 'no_cover_source' } as const;
  const prepared = prepareReadwiseApiDocuments([{ ...remote, title: target.title }], [])[0];
  if (!prepared) throw new Error('readwise_cover_repair_preparation_failed');
  const cover = await prepareReadwiseApiEpubCover(prepared);
  if (cover.degradedReason || !cover.text || cover.attachmentIds.length === 0) {
    throw new Error('readwise_cover_repair_download_failed');
  }
  const content = placeReadwiseApiEpubCover({ body: before.body!, cover: cover.text, title: target.title });
  const linkedIds = new Set(readImageAttachmentIds(target.nodeId));
  const linksChanged = cover.attachmentIds.some((id) => !linkedIds.has(id));
  if (content === before.body && !linksChanged) return { nodeId: target.nodeId, status: 'unchanged' } as const;
  commitRepair({
    attachmentIds: cover.attachmentIds,
    beforeBody: before.body!,
    connectionRef: target.connectionRef,
    content,
    documentId: target.documentId,
    nodeId: target.nodeId,
    sourceFingerprint: target.sourceFingerprint,
    title: target.title
  });
  return { nodeId: target.nodeId, status: 'repaired' } as const;
}

function requireEpubTarget(nodeId: string) {
  const target = loadReadwiseSourceResyncTarget(nodeId);
  if (!target) throw new Error('readwise_cover_repair_target_missing');
  if (target.state.metadata.category !== 'epub' || target.state.bodyState !== 'materialized') {
    throw new Error('readwise_cover_repair_target_not_epub');
  }
  return target;
}

function requireSource(connectionRef: string, documentId: string) {
  const source = loadReadwiseApiImportSource(connectionRef, documentId);
  if (!source?.nodeId || source.nodeDeleted || source.body === null) {
    throw new Error('readwise_cover_repair_target_missing');
  }
  return source;
}

function readImageAttachmentIds(nodeId: string) {
  return openDatabaseConnection().driver.queryAll<{ attachment_id: string }>(
    "SELECT attachment_id FROM node_attachments WHERE node_id = ? AND role = 'image'",
    [nodeId]
  ).map((row) => row.attachment_id);
}

function commitRepair(input: {
  attachmentIds: string[];
  beforeBody: string;
  connectionRef: string;
  content: string;
  documentId: string;
  nodeId: string;
  sourceFingerprint: string;
  title: string;
}) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  driver.transaction(() => {
    const current = requireSource(input.connectionRef, input.documentId);
    if (current.nodeId !== input.nodeId || current.sourceFingerprint !== input.sourceFingerprint
      || current.body !== input.beforeBody) {
      throw new Error('readwise_cover_repair_target_changed');
    }
    writeNodeBody({ content: input.content, driver, nodeId: input.nodeId, title: input.title, updatedAt: now });
    driver.execute(
      `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [loadOrCreateDesktopHostName(now), input.nodeId]
    );
    for (const attachmentId of input.attachmentIds) {
      createNodeAttachmentLink({ attachmentId, nodeId: input.nodeId, role: 'image' });
    }
    flushNodeSyncVersion(input.nodeId, now);
  });
}
