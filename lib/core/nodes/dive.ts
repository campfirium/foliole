import { resolveFolderSourceTopicIds } from './folderSourceTopics.js';
import { VIRTUAL_NODE_FILTER_VERSION, type VirtualNodeFilter } from './virtualNodeFilter.js';

export const DIVE_NODE_FILTER: VirtualNodeFilter = {
  version: VIRTUAL_NODE_FILTER_VERSION,
  match: 'all',
  conditions: [{ field: 'manual', operator: 'equals', value: 'dive-sources' }]
};

export const DIVE_SECTION_ROW_ID = 'workspace-dives';

export interface Dive {
  id: string;
  title: string;
  directSourceIds: readonly string[];
}

export function readDiveNode(node: {
  id: string;
  kind?: string;
  parentNodeId: string | null;
  title: string;
  virtualFilter?: VirtualNodeFilter | null;
  manualChildOrder?: readonly string[] | null;
} | undefined): Dive | null {
  const filter = node?.virtualFilter;
  const marker = filter?.conditions?.[0];
  if (node?.kind !== 'folder' || node.parentNodeId !== null ||
      filter?.version !== VIRTUAL_NODE_FILTER_VERSION || filter.match !== 'all' ||
      filter.conditions?.length !== 1 || marker?.field !== 'manual' ||
      marker.operator !== 'equals' || marker.value !== 'dive-sources') return null;
  return { id: node.id, title: node.title, directSourceIds: node.manualChildOrder ?? [] };
}

export function resolveDiveTopicIds(dive: Dive, tree: Parameters<typeof resolveFolderSourceTopicIds>[1]) {
  return resolveFolderSourceTopicIds(dive.directSourceIds, tree);
}
