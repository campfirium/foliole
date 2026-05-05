import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  type CompanionFolderListEntry,
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView,
  resolveCompanionTrashView
} from '../shared/platform/companionBrowseLists';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';
import {
  buildExternalLibraryFolderBrowseState,
  compareNaturalName,
  resolveExternalFolderLabel,
  type ExternalLibraryDirectoryNode
} from '../shared/platform/externalLibraryBrowseModel';

import { toTrashItem, toTrashRootItem, type TrashDirectoryListItem } from './CompanionDirectoryTrashModel';

const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

export type CompanionDirectorySelection =
  | { kind: 'root' }
  | { kind: 'internal'; nodeId: string }
  | { kind: 'trash' }
  | { kind: 'trashFolder'; nodeId: string }
  | { kind: 'virtual'; nodeId: string }
  | { folderId: string; kind: 'externalFolder' }
  | { directoryPath: string; folderId: string; kind: 'externalDirectory' }
  | { documentId: string; kind: 'externalDocument' };

export interface DirectorySection {
  id: 'internal' | 'virtual' | 'external' | 'current' | 'trash';
  items: DirectoryListItem[];
  title?: string;
}

export type DirectoryListItem =
  | (CompanionFolderListEntry & { id: string; source: 'internal' })
  | TrashDirectoryListItem
  | (CompanionFolderListEntry & { id: string; source: 'virtual' })
  | { id: string; kind: 'folder'; nodeId: string; preview: null; source: 'externalFolder'; title: string }
  | {
      directoryPath: string;
      folderId: string;
      id: string;
      kind: 'folder';
      nodeId: string;
      preview: null;
      source: 'externalDirectory';
      title: string;
    }
  | {
      documentId: string;
      folderId: string;
      id: string;
      kind: 'topic';
      nodeId: string;
      preview: string | null;
      source: 'externalDocument';
      title: string;
    };

type FolderView = ReturnType<typeof resolveCompanionFolderViewByNodeId>;
type RootView = ReturnType<typeof resolveCompanionRootDirectoryView>;
type TrashView = ReturnType<typeof resolveCompanionTrashView>;

function toInternalItem(item: CompanionFolderListEntry): DirectoryListItem {
  return { ...item, id: `internal:${item.nodeId}`, source: 'internal' };
}

function toVirtualItem(item: CompanionFolderListEntry): DirectoryListItem {
  return { ...item, id: `virtual:${item.nodeId}`, source: 'virtual' };
}

function toExternalFolderItem(folder: CompanionExternalDirectory['folders'][number]): DirectoryListItem {
  return {
    id: `external-folder:${folder.id}`,
    kind: 'folder',
    nodeId: folder.id,
    preview: null,
    source: 'externalFolder',
    title: resolveExternalFolderLabel(folder.folderPath)
  };
}

function toExternalDirectoryItem(node: ExternalLibraryDirectoryNode): DirectoryListItem {
  return {
    directoryPath: node.directoryPath,
    folderId: node.folderId,
    id: `external-directory:${node.folderId}:${node.directoryPath}`,
    kind: 'folder',
    nodeId: `${node.folderId}:${node.directoryPath}`,
    preview: null,
    source: 'externalDirectory',
    title: node.name
  };
}

function toExternalDocumentItem(entry: { absolutePath: string; folderId: string; openingText: string | null; title: string }): DirectoryListItem {
  return {
    documentId: entry.absolutePath,
    folderId: entry.folderId,
    id: `external-document:${entry.absolutePath}`,
    kind: 'topic',
    nodeId: entry.absolutePath,
    preview: entry.openingText,
    source: 'externalDocument',
    title: entry.title
  };
}

function resolveExternalSelectionItems(
  directory: CompanionExternalDirectory,
  selection: CompanionDirectorySelection
): DirectoryListItem[] | null {
  if (
    selection.kind === 'root' ||
    selection.kind === 'internal' ||
    selection.kind === 'trash' ||
    selection.kind === 'trashFolder' ||
    selection.kind === 'virtual'
  ) {
    return null;
  }
  const folderId = selection.kind === 'externalDocument'
    ? directory.entries.find((entry) => entry.documentId === selection.documentId)?.folderId
    : selection.folderId;
  const folder = directory.folders.find((candidate) => candidate.id === folderId);
  if (!folder || !folderId || selection.kind === 'externalDocument') {
    return [];
  }
  const entries = directory.entries.filter((entry) => entry.folderId === folderId);
  const browseState = buildExternalLibraryFolderBrowseState(
    folder,
    entries,
    selection.kind === 'externalDirectory'
      ? { directoryPath: selection.directoryPath, folderId, kind: 'directory' }
      : { folderId, kind: 'folder' }
  );
  const selectedDirectoryPath = browseState.selectedDirectoryPath;
  const directoryItems = browseState.directoryNodes
    .filter((node) => node.parentDirectoryPath === selectedDirectoryPath)
    .map(toExternalDirectoryItem);
  const documentItems = browseState.documentItems.map(toExternalDocumentItem);
  return [...directoryItems, ...documentItems];
}

function isVirtualRootItem(item: CompanionFolderListEntry) {
  return item.nodeId === VIRTUAL_ROOT_NODE_ID;
}

function isVirtualChild(snapshot: WorkspaceSnapshot | null, item: CompanionFolderListEntry) {
  return snapshot?.nodesById[item.nodeId]?.parentNodeId === VIRTUAL_ROOT_NODE_ID;
}

function resolveVirtualItems(snapshot: WorkspaceSnapshot | null, rootItems: CompanionFolderListEntry[]) {
  return rootItems
    .filter((item) => isVirtualRootItem(item) || isVirtualChild(snapshot, item))
    .map(toVirtualItem);
}

export function resolveDirectorySections(args: {
  directory: CompanionExternalDirectory;
  folderView: FolderView;
  rootView: RootView;
  selection: CompanionDirectorySelection;
  snapshot: WorkspaceSnapshot | null;
  trashView?: TrashView;
}): DirectorySection[] {
  const externalItems = resolveExternalSelectionItems(args.directory, args.selection);
  if (externalItems) return [{ id: 'current', items: externalItems }];
  if (args.selection.kind === 'trash' || args.selection.kind === 'trashFolder') {
    return [{ id: 'current', items: (args.trashView?.items ?? []).map(toTrashItem) }];
  }
  if (args.folderView) {
    const toItem = args.selection.kind === 'virtual' ? toVirtualItem : toInternalItem;
    return [{ id: 'current', items: args.folderView.items.map(toItem) }];
  }
  const rootItems = args.rootView.items;
  const internalItems = rootItems
    .filter((item) => !isVirtualRootItem(item) && !isVirtualChild(args.snapshot, item))
    .map(toInternalItem);
  const virtualItems = resolveVirtualItems(args.snapshot, rootItems);
  const externalFolders = [...args.directory.folders]
    .sort((left, right) => compareNaturalName(resolveExternalFolderLabel(left.folderPath), resolveExternalFolderLabel(right.folderPath)))
    .map(toExternalFolderItem);
  const sections: DirectorySection[] = [
    { id: 'internal', items: internalItems, title: 'Workspace' },
    { id: 'trash', items: [toTrashRootItem()], title: 'Trash' },
    { id: 'virtual', items: virtualItems, title: 'Virtual' },
    { id: 'external', items: externalFolders, title: 'External' }
  ];
  return sections.filter((section) => section.items.length > 0);
}
