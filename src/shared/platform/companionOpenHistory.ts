import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshotContract';
import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';
import { getWorkspaceListNodeAuthor } from '../../features/nodes/model/workspaceListNode';
import { isCanonicalVisibleNodeId } from '../workspaceCanonicalSelectors';

import {
  type CompanionRecentArticle,
  hasReadableContent,
  normalizeBodyStatus,
  resolveParentFolderLabel
} from './companionBrowseLists';
import { resolveCompanionArticleTitle } from './companionReadableArticle';

/** Matches the desktop material history limit. */
export const COMPANION_OPEN_HISTORY_LIMIT = 100;

/**
 * Materials this library recorded as opened (synced `node_open_state`, written by every device),
 * newest first. Only visible readable materials are listed; the row date is the last open time.
 */
export function resolveCompanionOpenHistory(
  snapshot: WorkspaceSnapshot | null,
  limit = COMPANION_OPEN_HISTORY_LIMIT
): CompanionRecentArticle[] {
  if (!snapshot?.nodeOpenStateById) return [];
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  const visits = Object.values(normalized.nodeOpenStateById ?? {})
    .filter((visit) => visit != null)
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt) || a.nodeId.localeCompare(b.nodeId));
  const history: CompanionRecentArticle[] = [];
  for (const visit of visits) {
    const node = normalized.nodesById[visit.nodeId];
    if (!node || !isCanonicalVisibleNodeId(normalized, node.id)) continue;
    // Any topic search can open, including child topics, matching the desktop history.
    if (node.kind !== 'topic' || node.anchorLink || !hasReadableContent(node)) continue;
    const bodyStatus = normalizeBodyStatus(node.bodyStatus);
    history.push({
      nodeId: node.id,
      authorLabel: getWorkspaceListNodeAuthor(node),
      bodyBlobHash: node.bodyBlobHash ?? null,
      folderLabel: resolveParentFolderLabel(normalized, node),
      preview: resolveNodeOpeningText(node.content || (node.openingText ?? ''), node.title),
      ...(bodyStatus ? { bodyStatus } : {}),
      title: resolveCompanionArticleTitle(node),
      updatedAt: visit.lastOpenedAt
    });
    if (history.length === limit) break;
  }
  return history;
}
