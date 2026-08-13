import type { WorkspaceState } from './workspaceStore';
import type {
  WorkspaceStructureCreateEntry,
  WorkspaceStructureDeleteEntry,
  WorkspaceStructureHistoryEntry,
  WorkspaceStructureKind,
  WorkspaceStructureMoveEntry,
  WorkspaceStructurePlacement,
  WorkspaceStructureRenameEntry
} from './workspaceStructureHistoryTypes';

function createEntryId() {
  return `workspace-history-${crypto.randomUUID()}`;
}

function actionTitle(action: 'Create' | 'Delete' | 'Move' | 'Rename', kind: WorkspaceStructureKind) {
  return `${action} ${kind === 'folder' ? 'Folder' : 'Topic'}`;
}

export function isWorkspaceStructureKind(kind: string): kind is WorkspaceStructureKind {
  return kind === 'folder' || kind === 'topic';
}

export function createStructureCreateEntry(args: {
  afterActiveNodeId: string | null;
  beforeActiveNodeId: string | null;
  kind: WorkspaceStructureKind;
  nodeIds: string[];
  rootNodeId: string;
}): WorkspaceStructureCreateEntry {
  return { ...args, id: createEntryId(), title: actionTitle('Create', args.kind), type: 'structure.create' };
}

export function createStructureDeleteEntry(args: {
  afterActiveNodeId: string | null;
  beforeActiveNodeId: string | null;
  kind: WorkspaceStructureKind;
  nodeIds: string[];
  rootNodeId: string;
}): WorkspaceStructureDeleteEntry {
  return { ...args, id: createEntryId(), title: actionTitle('Delete', args.kind), type: 'structure.delete' };
}

export function createStructureRenameEntry(args: {
  afterTitle: string;
  beforeTitle: string;
  kind: WorkspaceStructureKind;
  nodeId: string;
}): WorkspaceStructureRenameEntry {
  return { ...args, id: createEntryId(), title: actionTitle('Rename', args.kind), type: 'structure.rename' };
}

export function captureStructurePlacement(
  nodeOrder: string[],
  movedNodeIds: string[]
): WorkspaceStructurePlacement {
  const moved = new Set(movedNodeIds);
  const firstIndex = nodeOrder.findIndex((nodeId) => moved.has(nodeId));
  const lastIndex = nodeOrder.findLastIndex((nodeId) => moved.has(nodeId));
  return {
    previousNodeId: firstIndex > 0 ? nodeOrder[firstIndex - 1] ?? null : null,
    nextNodeId: lastIndex >= 0 ? nodeOrder[lastIndex + 1] ?? null : null
  };
}

function captureParents(state: WorkspaceState, rootNodeIds: string[]) {
  return Object.fromEntries(rootNodeIds.map((nodeId) => [nodeId, state.nodesById[nodeId]?.parentNodeId ?? null]));
}

export function createStructureMoveEntry(args: {
  after: WorkspaceState;
  before: WorkspaceState;
  movedNodeIds: string[];
  rootNodeIds: string[];
}): WorkspaceStructureMoveEntry | null {
  const kind = args.before.nodesById[args.rootNodeIds[0] ?? '']?.kind;
  if (!kind || !isWorkspaceStructureKind(kind)) return null;
  return {
    afterParentNodeIdByRoot: captureParents(args.after, args.rootNodeIds),
    afterPlacement: captureStructurePlacement(args.after.nodeOrder, args.movedNodeIds),
    beforeParentNodeIdByRoot: captureParents(args.before, args.rootNodeIds),
    beforePlacement: captureStructurePlacement(args.before.nodeOrder, args.movedNodeIds),
    id: createEntryId(),
    kind,
    movedNodeIds: [...args.movedNodeIds],
    rootNodeIds: [...args.rootNodeIds],
    title: actionTitle('Move', kind),
    type: 'structure.move'
  };
}

export function isSameHistoryEntry(
  left: WorkspaceStructureHistoryEntry | undefined,
  right: WorkspaceStructureHistoryEntry
) {
  return left?.id === right.id;
}
