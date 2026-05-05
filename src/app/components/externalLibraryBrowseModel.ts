import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';

export interface ExternalLibraryDocumentItem {
  absolutePath: string;
  extension: 'md' | 'txt';
  fileName: string;
  folderId: string;
  modifiedAt: string;
  openingText: string | null;
  relativePath: string;
  title: string;
}

export interface ExternalLibraryDirectoryNode {
  directoryPath: string;
  documentCount: number;
  folderId: string;
  hasChildren: boolean;
  name: string;
  parentDirectoryPath: string | null;
}

export type ExternalLibrarySelection =
  | { kind: 'root' }
  | { folderId: string; kind: 'folder' }
  | { directoryPath: string; folderId: string; kind: 'directory' }
  | { absolutePath: string; folderId: string; kind: 'document' };

export interface ExternalLibraryFolderBrowseState {
  directoryNodes: ExternalLibraryDirectoryNode[];
  documentItems: ExternalLibraryDocumentItem[];
  folder: RuntimeExternalSearchFolder;
  selectedDirectoryPath: string | null;
}

export function normalizeExternalDirectoryPath(pathValue: string) {
  return pathValue.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function resolveExternalFolderLabel(folderPath: string) {
  const normalizedPath = normalizeExternalDirectoryPath(folderPath);
  return normalizedPath.split('/').filter(Boolean).at(-1) ?? folderPath;
}

function resolveEntryDirectoryPath(relativePath: string) {
  const normalizedPath = normalizeExternalDirectoryPath(relativePath);
  const segments = normalizedPath.split('/');
  segments.pop();
  return segments.join('/');
}

function toDocumentItem(entry: RuntimeExternalSearchBrowseEntry): ExternalLibraryDocumentItem {
  return {
    absolutePath: entry.absolutePath,
    extension: entry.extension,
    fileName: entry.fileName,
    folderId: entry.folderId,
    modifiedAt: entry.modifiedAt,
    openingText: entry.openingText,
    relativePath: entry.relativePath,
    title: entry.title
  };
}

function collectDirectoryPaths(entries: RuntimeExternalSearchBrowseEntry[]) {
  const paths = new Set<string>();
  entries.forEach((entry) => {
    const segments = resolveEntryDirectoryPath(entry.relativePath).split('/').filter(Boolean);
    let currentPath = '';
    segments.forEach((segment) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      paths.add(currentPath);
    });
  });
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function buildDirectoryNode(folder: RuntimeExternalSearchFolder, directoryPath: string, entries: RuntimeExternalSearchBrowseEntry[]) {
  const normalizedDirectoryPath = normalizeExternalDirectoryPath(directoryPath);
  const documentCount = entries.filter((entry) => {
    const entryDirectoryPath = resolveEntryDirectoryPath(entry.relativePath);
    return entryDirectoryPath === normalizedDirectoryPath || entryDirectoryPath.startsWith(`${normalizedDirectoryPath}/`);
  }).length;
  const childPrefix = normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : '';
  const hasChildren = entries.some((entry) => {
    const entryDirectoryPath = resolveEntryDirectoryPath(entry.relativePath);
    if (!entryDirectoryPath.startsWith(childPrefix) || entryDirectoryPath === normalizedDirectoryPath) {
      return false;
    }
    return entryDirectoryPath.slice(childPrefix.length).includes('/');
  });

  return {
    directoryPath: normalizedDirectoryPath,
    documentCount,
    folderId: folder.id,
    hasChildren,
    name: normalizedDirectoryPath.split('/').filter(Boolean).at(-1) ?? resolveExternalFolderLabel(folder.folderPath),
    parentDirectoryPath: normalizedDirectoryPath.includes('/')
      ? normalizedDirectoryPath.slice(0, normalizedDirectoryPath.lastIndexOf('/'))
      : null
  } satisfies ExternalLibraryDirectoryNode;
}

function resolveSelectedDirectoryPath(
  entries: RuntimeExternalSearchBrowseEntry[],
  selection: Extract<ExternalLibrarySelection, { folderId: string }>
) {
  if (selection.kind === 'folder') {
    return '';
  }
  if (selection.kind === 'directory') {
    return normalizeExternalDirectoryPath(selection.directoryPath);
  }
  const documentEntry = entries.find((entry) => entry.absolutePath === selection.absolutePath);
  return resolveEntryDirectoryPath(documentEntry?.relativePath ?? '');
}

function listDocumentsForDirectory(entries: RuntimeExternalSearchBrowseEntry[], selectedDirectoryPath: string) {
  const directoryPrefix = selectedDirectoryPath ? `${selectedDirectoryPath}/` : '';
  return entries
    .filter((entry) => {
      const entryDirectoryPath = resolveEntryDirectoryPath(entry.relativePath);
      return selectedDirectoryPath
        ? entryDirectoryPath === selectedDirectoryPath || entryDirectoryPath.startsWith(directoryPrefix)
        : true;
    })
    .map((entry) => toDocumentItem(entry))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function buildExternalLibraryFolderBrowseState(
  folder: RuntimeExternalSearchFolder,
  entries: RuntimeExternalSearchBrowseEntry[],
  selection: Extract<ExternalLibrarySelection, { folderId: string }>
): ExternalLibraryFolderBrowseState {
  const selectedDirectoryPath = resolveSelectedDirectoryPath(entries, selection);
  return {
    directoryNodes: collectDirectoryPaths(entries).map((directoryPath) => buildDirectoryNode(folder, directoryPath, entries)),
    documentItems: listDocumentsForDirectory(entries, selectedDirectoryPath),
    folder,
    selectedDirectoryPath: selectedDirectoryPath || null
  };
}
