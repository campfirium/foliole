import {
  findEnabledSequentialReadingSourceId
} from './sequentialReading.js';
import { isSequentialReadingSourceNode } from './sequentialReadingSources.js';
import type { SequentialReadingNodes } from './sequentialReadingTypes.js';


export function findSequentialReadingSourcesForNode(
  nodeId: string,
  nodesById: SequentialReadingNodes
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
