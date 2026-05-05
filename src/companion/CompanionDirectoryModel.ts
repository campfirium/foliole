import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import {
  type CompanionFolderListEntry,
  resolveCompanionFolderViewByNodeId,
  resolveCompanionRootDirectoryView
} from '../shared/platform/companionBrowseLists';
import type {
  CompanionExternalDirectory,
  loadCompanionExternalDocument
} from '../shared/platform/companionExternalDocuments';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  buildExternalLibraryFolderBrowseState,
  compareNaturalName,
  resolveExternalEntryDirectoryPath,
  resolveExternalFolderLabel,
  type ExternalLibraryDirectoryNode
} from '../shared/platform/externalLibraryBrowseModel';

const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';

export type CompanionDirectorySelection =
  | { kind: 'root' }
  | { kind: 'internal'; nodeId: string }
  | { kind: 'virtual'; nodeId: string }
  | { folderId: string; kind: 'externalFolder' }
  | { directoryPath: string; folderId: string; kind: 'externalDirectory' }
  | { documentId: string; kind: 'externalDocument' };

export interface DirectorySection {
  id: 'internal' | 'virtual' | 'external' | 'current';
  items: DirectoryListItem[];
  title?: string;
}

export type DirectoryListItem =
  | (CompanionFolderListEntry & { id: string; source: 'internal' })
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
type ExternalDocument = NonNullable<Awaited<ReturnType<typeof loadCompanionExternalDocument>>>;

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
  if (selection.kind === 'root' || selection.kind === 'internal' || selection.kind === 'virtual') {
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
}): DirectorySection[] {
  const externalItems = resolveExternalSelectionItems(args.directory, args.selection);
  if (externalItems) return [{ id: 'current', items: externalItems }];
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
    { id: 'virtual', items: virtualItems, title: 'Virtual' },
    { id: 'external', items: externalFolders, title: 'External' }
  ];
  return sections.filter((section) => section.items.length > 0);
}

export function resolveDirectoryParentSelection(args: {
  directory: CompanionExternalDirectory;
  selection: CompanionDirectorySelection;
  snapshot: WorkspaceSnapshot | null;
}): CompanionDirectorySelection | null {
  if (args.selection.kind === 'root') return null;
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

export function toReadableExternalArticle(document: ExternalDocument): CompanionReadableArticle {
  return {
    bodyStatus: document.bodyStatus,
    content: document.content,
    hideTitleHeading: false,
    nodeId: document.document_id,
    persistedNodeViewState: null,
    pdfAttachmentId: null,
    textAnchorDecorations: [],
    title: document.title
  };
}
