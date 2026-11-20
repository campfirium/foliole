import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { listWorkspaceMetadataParents } from '../store/workspaceNodeMetadataHistory';

export interface MoveDestinationRow {
  id: string;
  title: string;
  path: string;
  kind: WorkspaceNodeSnapshot['kind'];
  selectable: boolean;
  depth: number;
  hasChildren: boolean;
}

export function buildMoveDestinationTree(source: WorkspaceNodeSnapshot, nodes: Record<string, WorkspaceNodeSnapshot>,
  titleFor: (node: WorkspaceNodeSnapshot) => string) {
  return buildCompanionDestinationTree(listWorkspaceMetadataParents(source, nodes), nodes, titleFor);
}

/** Destinations that are valid for every selected node, so a batch move cannot fail on one of them. */
export function buildBatchMoveDestinationTree(sources: readonly WorkspaceNodeSnapshot[], nodes: Record<string, WorkspaceNodeSnapshot>,
  titleFor: (node: WorkspaceNodeSnapshot) => string) {
  const [first, ...rest] = sources;
  const shared = first ? rest.reduce((targets, source) => {
    const allowed = new Set(listWorkspaceMetadataParents(source, nodes).map(node => node.id));
    return targets.filter(node => allowed.has(node.id));
  }, listWorkspaceMetadataParents(first, nodes)) : [];
  return buildCompanionDestinationTree(shared, nodes, titleFor);
}

export function buildCompanionDestinationTree(targets: readonly WorkspaceNodeSnapshot[], nodes: Record<string, WorkspaceNodeSnapshot>,
  titleFor: (node: WorkspaceNodeSnapshot) => string) {
  const targetIds = new Set(targets.map(node => node.id));
  const included = new Set(targetIds);
  for (const node of targets) {
    let parentId = node.parentNodeId;
    while (parentId && nodes[parentId] && !included.has(parentId)) {
      included.add(parentId);
      parentId = nodes[parentId]!.parentNodeId;
    }
  }
  const rows = new Map<string, MoveDestinationRow>();
  const children = new Map<string | null, string[]>();
  for (const node of Object.values(nodes)) {
    if (!included.has(node.id)) continue;
    const path = destinationPath(node, nodes, titleFor);
    rows.set(node.id, { id: node.id, title: titleFor(node), path, kind: node.kind,
      selectable: targetIds.has(node.id), depth: 0, hasChildren: false });
    const parent = node.parentNodeId && included.has(node.parentNodeId) ? node.parentNodeId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(node.id);
    children.set(parent, siblings);
  }
  for (const row of rows.values()) row.hasChildren = Boolean(children.get(row.id)?.length);
  return { rows, children };
}

function destinationPath(node: WorkspaceNodeSnapshot, nodes: Record<string, WorkspaceNodeSnapshot>,
  titleFor: (node: WorkspaceNodeSnapshot) => string) {
  const titles = [titleFor(node)];
  const visited = new Set([node.id]);
  let parent = nodes[node.parentNodeId ?? ''];
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    titles.unshift(titleFor(parent));
    parent = nodes[parent.parentNodeId ?? ''];
  }
  return titles.join(' / ');
}

export function visibleMoveDestinations(tree: ReturnType<typeof buildMoveDestinationTree>, expanded: ReadonlySet<string>, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized) return [...tree.rows.values()].filter(row => row.selectable && row.path.toLocaleLowerCase().includes(normalized));
  const result: MoveDestinationRow[] = [];
  const visited = new Set<string>();
  const pending = [...(tree.children.get(null) ?? [])].reverse().map(id => ({ id, depth: 0 }));
  while (pending.length) {
    const entry = pending.pop()!;
    if (visited.has(entry.id)) continue;
    visited.add(entry.id);
    result.push({ ...tree.rows.get(entry.id)!, depth: entry.depth });
    if (expanded.has(entry.id)) {
      pending.push(...[...(tree.children.get(entry.id) ?? [])].reverse().map(id => ({ id, depth: entry.depth + 1 })));
    }
  }
  return result;
}
