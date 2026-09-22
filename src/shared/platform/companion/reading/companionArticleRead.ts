import { parseStoredAnchorLink } from '../../../../../lib/core/database/anchorLinkCodec';
import { ANDROID_COMPANION_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionQueryDefinitions';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import { resolveLoadedCompanionArticle, type CompanionNodeDocument } from '../../companionReadableArticle';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { CompanionReadingSnapshotChanged } from './companionReadingDemand';
import { getCompanionReadingScope } from './companionReadingScope';

interface Annotation extends DbRow {
  id: string;
  current_version_id: string | null;
  body_blob_hash: string | null;
  anchor_link: string | null;
  content: string;
}

function matchesAnnotations(snapshot: WorkspaceSnapshot, nodeId: string, rows: Annotation[]) {
  const expected = Object.values(snapshot.nodesById).filter((node) =>
    node.parentNodeId === nodeId && node.anchorLink && !node.deletedAt);
  return expected.length === rows.length && rows.every((row) => {
    const node = snapshot.nodesById[row.id];
    return node && node.parentNodeId === nodeId &&
      (node.currentVersionId ?? null) === row.current_version_id &&
      (node.bodyBlobHash ?? null) === row.body_blob_hash &&
      JSON.stringify(parseStoredAnchorLink(JSON.stringify(node.anchorLink))) ===
        JSON.stringify(parseStoredAnchorLink(row.anchor_link));
  });
}

export function readCompanionArticle(
  snapshot: WorkspaceSnapshot,
  nodeId: string,
  isCurrent: () => boolean
) {
  const scope = getCompanionReadingScope();
  return getIosCompanionDatabaseOwner().read(async (db) => {
    if (scope !== getCompanionReadingScope() || !isCurrent()) return null;
    const sql = ANDROID_COMPANION_QUERY_DEFINITIONS.readableArticleByNodeId.sql;
    const [document] = await db.query<CompanionNodeDocument & DbRow>(
      `SELECT article.*, n.current_version_id, n.deleted_at, n.parent_id
       FROM (${sql}) article JOIN nodes n ON n.id = article.id`, [nodeId]
    );
    if (!document) return null;
    const annotations = await db.query<Annotation>(
      `SELECT n.id, n.current_version_id, n.body_blob_hash, n.anchor_link,
        COALESCE(CAST(cbd.data AS TEXT), n.content, '') AS content
       FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.parent_id = ? AND n.anchor_link IS NOT NULL AND n.deleted_at IS NULL
         AND COALESCE(n.anchor_resolution_status, '') NOT LIKE 'unmapped_%'`, [nodeId]
    );
    if (scope !== getCompanionReadingScope() || !isCurrent()) return null;
    if ((snapshot.nodesById[nodeId]?.currentVersionId ?? null) !== document.current_version_id ||
      (snapshot.nodesById[nodeId]?.bodyBlobHash ?? null) !== document.body_blob_hash ||
      (snapshot.nodesById[nodeId]?.deletedAt ?? null) !== (document.deleted_at ?? null) ||
      (snapshot.nodesById[nodeId]?.parentNodeId ?? null) !== (document.parent_id ?? null) ||
      !matchesAnnotations(snapshot, nodeId, annotations)) throw new CompanionReadingSnapshotChanged();
    return resolveLoadedCompanionArticle(snapshot, document,
      Object.fromEntries(annotations.map((row) => [row.id, row.content])));
  });
}
