import {
  findEnabledSequentialReadingSourceId
} from './workspaceSequentialReading';
import { isSequentialReadingSourceNode } from './workspaceSequentialReadingSources';
import type { WorkspaceState } from './workspaceStore';

export function findSequentialReadingSourcesForNode(
  nodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  const sources = new Set<string>();
  const enabledSourceId = findEnabledSequentialReadingSourceId(nodeId, nodesById);
  if (enabledSourceId) {
    sources.add(enabledSourceId);
  }
  const node = nodesById[nodeId];
  if (node && isSequentialReadingSourceNode(node, nodesById) && node.sequentialReadingEnabled === true) {
    sources.add(nodeId);
  }
  return sources;
}
