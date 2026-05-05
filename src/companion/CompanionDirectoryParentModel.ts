import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';
import { resolveExternalEntryDirectoryPath } from '../shared/platform/externalLibraryBrowseModel';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';

const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

export function resolveDirectoryParentSelection(args: {
  directory: CompanionExternalDirectory;
  selection: CompanionDirectorySelection;
  snapshot: WorkspaceSnapshot | null;
}): CompanionDirectorySelection | null {
  if (args.selection.kind === 'root') return null;
  if (args.selection.kind === 'trash') return { kind: 'root' };
  if (args.selection.kind === 'trashFolder') return resolveTrashParent(args.snapshot, args.selection);
  if (args.selection.kind === 'externalFolder') return { kind: 'root' };
  if (args.selection.kind === 'externalDirectory') return resolveExternalDirectoryParent(args.selection);
  if (args.selection.kind === 'externalDocument') return resolveExternalDocumentParent(args.directory, args.selection.documentId);
  return resolveWorkspaceParent(args.snapshot, args.selection);
}

function resolveExternalDirectoryParent(
  selection: Extract<CompanionDirectorySelection, { kind: 'externalDirectory' }>
): CompanionDirectorySelection {
  if (!selection.directoryPath.includes('/')) return { folderId: selection.folderId, kind: 'externalFolder' };
  return {
    directoryPath: selection.directoryPath.slice(0, selection.directoryPath.lastIndexOf('/')),
    folderId: selection.folderId,
    kind: 'externalDirectory'
  };
}

function resolveExternalDocumentParent(
  directory: CompanionExternalDirectory,
  documentId: string
): CompanionDirectorySelection {
  const entry = directory.entries.find((candidate) => candidate.documentId === documentId);
  if (!entry) return { kind: 'root' };
  const directoryPath = resolveExternalEntryDirectoryPath(entry.relativePath);
  return directoryPath
    ? { directoryPath, folderId: entry.folderId, kind: 'externalDirectory' }
    : { folderId: entry.folderId, kind: 'externalFolder' };
}

function resolveWorkspaceParent(
  snapshot: WorkspaceSnapshot | null,
  selection: Extract<CompanionDirectorySelection, { kind: 'internal' | 'virtual' }>
): CompanionDirectorySelection {
  const parentNodeId = snapshot?.nodesById[selection.nodeId]?.parentNodeId ?? null;
  if (!parentNodeId || parentNodeId === VIRTUAL_ROOT_NODE_ID) return { kind: 'root' };
  return { kind: selection.kind, nodeId: parentNodeId };
}

function resolveTrashParent(
  snapshot: WorkspaceSnapshot | null,
  selection: Extract<CompanionDirectorySelection, { kind: 'trashFolder' }>
): CompanionDirectorySelection {
  const parentNodeId = snapshot?.nodesById[selection.nodeId]?.parentNodeId ?? null;
  if (!parentNodeId || !snapshot?.trashedNodeIds.includes(parentNodeId)) return { kind: 'trash' };
  return { kind: 'trashFolder', nodeId: parentNodeId };
}
