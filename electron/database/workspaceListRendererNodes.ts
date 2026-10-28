import type { WorkspaceListNodeSnapshot } from '../../lib/core/database/workspaceListSnapshotNodes.js';

/** Host import identities and empty remote lifecycle have no desktop list consumers. */
export function projectWorkspaceListRendererNode(node: WorkspaceListNodeSnapshot, libraryScope: string) {
  const projected = { ...node };
  delete projected.importContentFingerprint;
  delete projected.importSourceFingerprint;
  delete projected.readwiseRemoteLifecycle;
  if (projected.attachments) {
    projected.attachments = projected.attachments.map(attachment => ({ ...attachment, libraryScope }));
  }
  return projected;
}
