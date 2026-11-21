import { specialRootNodeDefinition } from '../../lib/core/database/nodeMutationSpecialRoots';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { collectWorkspaceMetadataSubtree } from '../store/workspaceNodeMetadataHistory';
import { buildWorkspaceMetadataMutation, type WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';

type WorkspacePreview = {
  base: WorkspaceSnapshot; snapshot: WorkspaceSnapshot; build: (snapshot: WorkspaceSnapshot) => WorkspaceSnapshot;
  rebased?: { source: WorkspaceSnapshot; result: WorkspaceSnapshot };
};
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

/**
 * Lays the expected change over the published library. A publication that arrives before the write's own
 * (an open record, a sync, a derived Virtual folder result) gets the same change laid over it again.
 */
export function applyCompanionWorkspacePreview(snapshot: WorkspaceSnapshot | null, preview: WorkspacePreview | null) {
  if (!preview || !snapshot) return snapshot;
  if (snapshot === preview.base) return preview.snapshot;
  if (preview.rebased?.source !== snapshot) preview.rebased = { source: snapshot, result: preview.build(snapshot) };
  return preview.rebased.result;
}

/**
 * Shows the expected library at once while the write runs. The preview ends by itself once a publication
 * already holds the change; the returned function withdraws it, which restores the library when the write did not commit.
 */
function previewCompanionWorkspace(build: (base: WorkspaceSnapshot) => WorkspaceSnapshot) {
  const base = companionWorkspaceSnapshots.getSnapshot();
  if (!base) return () => {};
  const snapshot = build(base);
  if (snapshot === base) return () => {};
  const preview: WorkspacePreview = { base, snapshot, build };
  const stop = companionWorkspaceSnapshots.subscribe(() => {
    const published = companionWorkspaceSnapshots.getSnapshot();
    // The write's result has arrived, or the library it was built for is gone: nothing is left to lay over.
    if (applyCompanionWorkspacePreview(published, preview) === published) withdraw();
  });
  const withdraw = () => {
    stop();
    if (current !== preview) return;
    current = null;
    notify();
  };
  current = preview;
  notify();
  return withdraw;
}

/**
 * For a node shown only ahead of its write, resolves true once a publication holds it and false when its
 * preview leaves without one; any other node resolves true at once.
 */
export function whenCompanionWorkspaceNodePublished(nodeId: string) {
  const published = () => Boolean(companionWorkspaceSnapshots.getSnapshot()?.nodesById[nodeId]);
  const previewed = () => Boolean(applyCompanionWorkspacePreview(companionWorkspaceSnapshots.getSnapshot(), current)?.nodesById[nodeId]);
  if (published() || !previewed()) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const check = () => {
      if (!published() && previewed()) return;
      stopSnapshots();
      stopPreview();
      resolve(published());
    };
    const stopSnapshots = companionWorkspaceSnapshots.subscribe(check);
    const stopPreview = subscribeCompanionWorkspacePreview(check);
  });
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
