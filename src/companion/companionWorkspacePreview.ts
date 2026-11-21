import { specialRootNodeDefinition } from '../../lib/core/database/nodeMutationSpecialRoots';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { collectWorkspaceMetadataSubtree } from '../store/workspaceNodeMetadataHistory';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';

type WorkspacePreview = { base: WorkspaceSnapshot; snapshot: WorkspaceSnapshot };
type CompanionCreateCommand = Extract<WorkspaceMetadataCommand, { type: 'create' | 'create-dive' | 'create-index' }>;

let current: WorkspacePreview | null = null;
const listeners = new Set<() => void>();

export function subscribeCompanionWorkspacePreview(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCompanionWorkspacePreview() {
  return current;
}

/** Shows the preview only over the snapshot it was built from; any later publication replaces it. */
export function applyCompanionWorkspacePreview(snapshot: WorkspaceSnapshot | null, preview: WorkspacePreview | null) {
  return preview && snapshot === preview.base ? preview.snapshot : snapshot;
}

/**
 * Shows the expected library at once while the write runs. The returned function withdraws the
 * preview, which restores the unchanged library when the write did not commit.
 */
function previewCompanionWorkspace(build: (base: WorkspaceSnapshot) => WorkspaceSnapshot) {
  const base = companionWorkspaceSnapshots.getSnapshot();
  if (!base) return () => {};
  const snapshot = build(base);
  if (snapshot === base) return () => {};
  const preview = { base, snapshot };
  current = preview;
  notify();
  return () => {
    if (current !== preview) return;
    current = null;
    notify();
  };
}

/** Shows the moved nodes in Trash at once while the write runs. */
export function previewCompanionTrash(rootIds: readonly string[], now = new Date().toISOString()) {
  return previewCompanionWorkspace(base => buildCompanionTrashPreview(base, rootIds, now));
}

/** Shows a new folder, topic, item, Dive or Virtual folder in its parent at once while the write runs. */
export function previewCompanionCreate(command: CompanionCreateCommand, now = new Date().toISOString()) {
  return previewCompanionWorkspace(base => buildCompanionCreatePreview(base, command, now));
}

export function buildCompanionCreatePreview(snapshot: WorkspaceSnapshot, command: CompanionCreateCommand, now: string): WorkspaceSnapshot {
  let nodes;
  // The write validates the same command against the stored library; a preview that cannot be built shows nothing early.
  try { nodes = buildWorkspaceMetadataMutation(command, snapshot.nodesById, now).nodes; } catch { return snapshot; }
  // A Virtual folder write creates the Virtual root first when the library has none yet.
  if (command.type === 'create-index' && !snapshot.nodesById[VIRTUAL_ROOT_NODE_ID]) nodes = [virtualRootNode(now), ...nodes];
  return normalizeWorkspaceSnapshot({ ...snapshot,
    nodesById: { ...snapshot.nodesById, ...Object.fromEntries(nodes.map(node => [node.id, node])) },
    nodeOrder: [...snapshot.nodeOrder, ...nodes.map(node => node.id)] });
}

function virtualRootNode(now: string): WorkspaceNodeSnapshot {
  return { id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', title: specialRootNodeDefinition(VIRTUAL_ROOT_NODE_ID)!.title, parentNodeId: null,
    isTitleManual: true, hideTitleHeading: false, content: '', reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: now, updatedAt: now, deletedAt: null };
}

export function buildCompanionTrashPreview(snapshot: WorkspaceSnapshot, rootIds: readonly string[], now: string): WorkspaceSnapshot {
  const nodesById = { ...snapshot.nodesById };
  const moved = new Set<string>();
  for (const rootId of rootIds) {
    if (!nodesById[rootId]) continue;
    for (const id of collectWorkspaceMetadataSubtree(rootId, snapshot.nodesById)) {
      const node = nodesById[id];
      if (!node || node.deletedAt) continue;
      nodesById[id] = { ...node, deletedAt: now, updatedAt: now };
      moved.add(id);
    }
  }
  if (!moved.size) return snapshot;
  const next = normalizeWorkspaceSnapshot({ ...snapshot, nodesById });
  if (snapshot.virtualResultIdsByNodeId) {
    next.virtualResultIdsByNodeId = Object.fromEntries(Object.entries(snapshot.virtualResultIdsByNodeId)
      .map(([id, results]) => [id, results.filter(result => !moved.has(result))]));
  }
  return next;
}

function notify() {
  for (const listener of listeners) {
    try { listener(); } catch { /* A display observer cannot change the write. */ }
  }
}
