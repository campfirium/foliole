import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import { HOME_NODE_ID, INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { getWorkspaceListNodeOpening } from '../../features/nodes/model/workspaceListNode';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { resolveNodeDisplayTitle } from '../../shared/localization/systemEntryNames';
import { isCanonicalVisibleNodeId } from '../../shared/workspaceCanonicalSelectors';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

export const MATERIAL_HISTORY_LIMIT = 100;

type HistorySource = Pick<WorkspaceState,
  'nodesById' | 'nodeOrder' | 'nodeOpenStateById' | 'trashedNodeIds' | 'trashedNodeDeletedAtById'>;

export function selectMaterialHistory(state: HistorySource, pins: string[] = [], lastEdited?: string) {
  const visited = Object.values(state.nodeOpenStateById)
    .filter((visit) => visit != null)
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt) || a.nodeId.localeCompare(b.nodeId))
    .map(({ nodeId }) => nodeId);
  const ordered = new Set([...pins, ...(lastEdited ? [lastEdited] : []), ...visited]);
  const pinnedIds = new Set(pins);
  const history = [];
  for (const id of ordered) {
    const node = state.nodesById[id];
    if (!node || node.specialKind || node.kind === 'folder' || !isCanonicalVisibleNodeId(state, id)) continue;
    history.push({ node, pinned: pinnedIds.has(id) });
    if (history.length === MATERIAL_HISTORY_LIMIT) break;
  }
  return history;
}

export function materialHistoryPath(nodes: HistorySource['nodesById'], parentId: string | null) {
  const locale = getStoredAppLocale();
  const path = buildNodeBreadcrumbs(parentId, nodes, Number.POSITIVE_INFINITY);
  return path
    .filter((item) => item.id !== HOME_NODE_ID && item.id !== INBOX_NODE_ID)
    .map((item) => resolveNodeDisplayTitle(locale, item.id, item.title).trim())
    .filter(Boolean)
    .join(' / ');
}

export function materialHistoryPreview(node: NonNullable<HistorySource['nodesById'][string]>) {
  return node.openingText?.trim() || (node.content.trim() ? getWorkspaceListNodeOpening(node) : node.title);
}

export function filterMaterialHistory(
  history: ReturnType<typeof selectMaterialHistory>,
  nodes: HistorySource['nodesById'],
  query: string
) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return history;
  return history.filter(({ node }) => [
    node.title, materialHistoryPreview(node), materialHistoryPath(nodes, node.parentNodeId)
  ].some((value) => value.toLocaleLowerCase().includes(term)));
}
