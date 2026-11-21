import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { collectWorkspaceMetadataSubtree } from '../store/workspaceNodeMetadataHistory';

type TrashPreview = { base: WorkspaceSnapshot; snapshot: WorkspaceSnapshot };

let current: TrashPreview | null = null;
const listeners = new Set<() => void>();

export function subscribeCompanionTrashPreview(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCompanionTrashPreview() {
  return current;
}

/** Shows the preview only over the snapshot it was built from; any later publication replaces it. */
export function applyCompanionTrashPreview(snapshot: WorkspaceSnapshot | null, preview: TrashPreview | null) {
  return preview && snapshot === preview.base ? preview.snapshot : snapshot;
}

/**
 * Shows the moved nodes in Trash at once while the write runs. The returned function withdraws the
 * preview, which restores the unchanged library when the write did not commit.
 */
export function previewCompanionTrash(rootIds: readonly string[], now = new Date().toISOString()) {
  const base = companionWorkspaceSnapshots.getSnapshot();
  if (!base) return () => {};
  const preview = { base, snapshot: buildCompanionTrashPreview(base, rootIds, now) };
  current = preview;
  notify();
  return () => {
    if (current !== preview) return;
    current = null;
    notify();
  };
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
