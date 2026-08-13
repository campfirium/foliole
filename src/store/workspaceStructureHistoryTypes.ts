import type { NodeKind } from '../../lib/core/nodes/nodeKind';

export type WorkspaceStructureKind = Extract<NodeKind, 'folder' | 'topic'>;

interface WorkspaceStructureHistoryBase {
  id: string;
  kind: WorkspaceStructureKind;
  title: string;
}

export interface WorkspaceStructureCreateEntry extends WorkspaceStructureHistoryBase {
  afterActiveNodeId: string | null;
  beforeActiveNodeId: string | null;
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

export interface WorkspaceStructurePlacement {
  nextNodeId: string | null;
  previousNodeId: string | null;
}

export interface WorkspaceStructureMoveEntry extends WorkspaceStructureHistoryBase {
  afterParentNodeIdByRoot: Record<string, string | null>;
  afterPlacement: WorkspaceStructurePlacement;
  beforeParentNodeIdByRoot: Record<string, string | null>;
  beforePlacement: WorkspaceStructurePlacement;
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
