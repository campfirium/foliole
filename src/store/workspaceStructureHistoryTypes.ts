import type { NodeKind } from '../../lib/core/nodes/nodeKind';

import type { WorkspaceHistoryContext } from './workspaceHistoryContext';

export type WorkspaceStructureKind = Extract<NodeKind, 'folder' | 'topic'>;

interface WorkspaceStructureHistoryBase {
  id: string;
  kind: WorkspaceStructureKind;
  title: string;
}

export interface WorkspaceStructureCreateEntry extends WorkspaceStructureHistoryBase {
  afterActiveNodeId: string | null;
  afterContext: WorkspaceHistoryContext;
  beforeActiveNodeId: string | null;
  beforeContext: WorkspaceHistoryContext;
  nodeIds: string[];
  rootNodeId: string;
  type: 'structure.create';
}

export interface WorkspaceStructureDeleteEntry extends WorkspaceStructureHistoryBase {
  afterActiveNodeId: string | null;
  beforeActiveNodeId: string | null;
  nodeIds: string[];
  rootNodeId: string;
  type: 'structure.delete';
}

export interface WorkspaceStructureRenameEntry extends WorkspaceStructureHistoryBase {
  afterTitle: string;
  beforeTitle: string;
  nodeId: string;
  type: 'structure.rename';
}

export interface WorkspaceStructureParentOrder {
  parentNodeId: string | null;
  childIds: string[];
}

export interface WorkspaceStructureMoveEntry extends WorkspaceStructureHistoryBase {
  afterParentNodeIdByRoot: Record<string, string | null>;
  afterParentOrders: WorkspaceStructureParentOrder[];
  beforeParentNodeIdByRoot: Record<string, string | null>;
  beforeParentOrders: WorkspaceStructureParentOrder[];
  movedNodeIds: string[];
  rootNodeIds: string[];
  type: 'structure.move';
}

export type WorkspaceStructureHistoryEntry =
  | WorkspaceStructureCreateEntry
  | WorkspaceStructureDeleteEntry
  | WorkspaceStructureMoveEntry
  | WorkspaceStructureRenameEntry;

export interface WorkspaceStructurePendingCreate {
  entry: WorkspaceStructureCreateEntry;
  undoRequested: boolean;
}
