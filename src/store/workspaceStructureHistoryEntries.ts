import type { WorkspaceHistoryContext } from './workspaceHistoryContext';
import type { WorkspaceState } from './workspaceStore';
import type {
  WorkspaceStructureCreateEntry,
  WorkspaceStructureDeleteEntry,
  WorkspaceStructureHistoryEntry,
  WorkspaceStructureKind,
  WorkspaceStructureMoveEntry,
  WorkspaceStructureRenameEntry
} from './workspaceStructureHistoryTypes';
import { captureStructureParentOrders } from './workspaceStructureParentOrders';

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
  afterContext: WorkspaceHistoryContext;
  beforeActiveNodeId: string | null;
  beforeContext: WorkspaceHistoryContext;
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
  const parentIds = args.rootNodeIds.flatMap((id) => [
    args.before.nodesById[id]?.parentNodeId ?? null,
    args.after.nodesById[id]?.parentNodeId ?? null
  ]);
  return {
    afterParentNodeIdByRoot: captureParents(args.after, args.rootNodeIds),
    afterParentOrders: captureStructureParentOrders(args.after, parentIds),
    beforeParentNodeIdByRoot: captureParents(args.before, args.rootNodeIds),
    beforeParentOrders: captureStructureParentOrders(args.before, parentIds),
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
