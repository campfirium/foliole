import type { WorkspaceListNodeSnapshot } from '../../lib/core/database/workspaceListSnapshotNodes.js';

/** Import identities belong to host import/sync operations, not desktop lists. */
export function projectWorkspaceListRendererNode(node: WorkspaceListNodeSnapshot, libraryScope: string) {
  const projected = { ...node };
  delete projected.importContentFingerprint;
  delete projected.importSourceFingerprint;
  if (projected.attachments) {
    projected.attachments = projected.attachments.map(attachment => ({ ...attachment, libraryScope }));
  }
  return projected;
}
