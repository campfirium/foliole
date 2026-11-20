import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { readDiveNode } from '../../lib/core/nodes/dive';
import { resolveDiveMembership } from '../shared/diveMembership';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import type { CompanionDirectorySelection, DirectoryListItem, DirectorySection } from './CompanionDirectoryModel';

export function resolveCompanionDiveSections(
  snapshot: WorkspaceSnapshot | null,
  selection: CompanionDirectorySelection
): DirectorySection[] | null {
  if (!snapshot || selection.kind !== 'virtual') return null;
  const dive = readDiveNode(snapshot.nodesById[selection.nodeId]);
  if (!dive) return null;

  if (!isCanonicalVisibleNodeId(snapshot, dive.id)) return null;
  const { sources, topics } = resolveDiveMembership(snapshot, dive);
  const directIds = new Set(sources);
  const rowIds = [...sources, ...topics.filter(id => !directIds.has(id))];
  const items = rowIds.map((id): DirectoryListItem => {
    const node = snapshot.nodesById[id]!;
    return { id, nodeId: id, source: 'internal', kind: node.kind,
      ...(directIds.has(id) ? { directDiveId: dive.id } : {}),
      title: node.title, preview: node.openingText ?? null };
  });
  return [{ id: 'current', items }];
}
