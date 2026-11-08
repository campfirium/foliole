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
  const toItem = (section: string, id: string): DirectoryListItem => {
    const node = snapshot.nodesById[id]!;
    return { id: `${section}:${id}`, nodeId: id, source: 'internal', kind: node.kind,
      title: node.title, preview: node.openingText ?? null };
  };
  const sections: DirectorySection[] = [
    { id: 'diveSources', titleKey: 'desktop.nodeList.dive.sources', items: sources.map(id => toItem('source', id)) },
    { id: 'diveTopics', titleKey: 'desktop.nodeList.dive.members', items: topics.map(id => toItem('member', id)) }
  ];
  return sections.filter(section => section.items.length > 0);
}
