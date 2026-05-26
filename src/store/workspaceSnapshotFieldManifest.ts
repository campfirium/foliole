import type { Node } from '../features/nodes/model/nodeTypes';

export const WORKSPACE_NODE_BOUNDARY_PRESERVED_FIELDS = [
  'id',
  'parentNodeId',
  'kind',
  'priority',
  'desiredRetention',
  'enableShortTerm',
  'sequentialReadingEnabled',
  'shelvedAt',
  'manualChildOrder',
  'specialKind',
  'title',
  'isTitleManual',
  'hideTitleHeading',
  'attachments',
  'bodyBlobHash',
  'bodyStatus',
  'openingText',
  'currentVersionId',
  'anchorLink',
  'imageRegions',
  'virtualFilter',
  'reading',
  'review',
  'createdAt',
  'deletedAt',
  'updatedAt'
] as const satisfies readonly (keyof Node)[];

export function hasMatchingBoundaryPreservedFields(currentNode: Node, sourceNode: Node) {
  return WORKSPACE_NODE_BOUNDARY_PRESERVED_FIELDS.every((field) => currentNode[field] === sourceNode[field]);
}
