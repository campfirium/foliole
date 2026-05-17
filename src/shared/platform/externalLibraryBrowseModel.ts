export interface ExternalLibraryBrowseEntry {
  absolutePath: string;
  extension: 'md' | 'txt';
  fileName: string;
  folderId: string;
  importedNodeId?: string | null;
  modifiedAt: string;
  openingText: string | null;
  relativePath: string;
  title: string;
}

export interface ExternalLibraryFolder {
  documentCount: number;
  folderPath: string;
  id: string;
}

export type ExternalLibraryDocumentItem = ExternalLibraryBrowseEntry;

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
  folder: ExternalLibraryFolder;
  selectedDirectoryPath: string | null;
}

export function compareNaturalName(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), undefined, { numeric: true, sensitivity: 'base' });
}

export function normalizeExternalDirectoryPath(pathValue: string) {
  return pathValue.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function resolveExternalFolderLabel(folderPath: string) {
  const normalizedPath = normalizeExternalDirectoryPath(folderPath);
  return normalizedPath.split('/').filter(Boolean).at(-1) ?? folderPath;
}

const READWISE_EXTERNAL_FOLDER_LABELS: Record<string, string> = {
  'readwise-reader-import-articles': 'Readwise Articles',
  'readwise-reader-import-books': 'Readwise Books',
  'readwise-reader-import-podcasts': 'Readwise Podcasts',
  'readwise-reader-import-tweets': 'Readwise Tweets'
};

const READWISE_EXTERNAL_CHILD_LABELS: Record<string, string> = {
  'readwise-reader-import-articles': 'Articles',
  'readwise-reader-import-books': 'Books',
  'readwise-reader-import-podcasts': 'Podcasts',
  'readwise-reader-import-tweets': 'Tweets'
};

export function isReadwiseExternalFolder(folder: Pick<ExternalLibraryFolder, 'id'>) {
  return Object.prototype.hasOwnProperty.call(READWISE_EXTERNAL_FOLDER_LABELS, folder.id);
}

export function resolveExternalFolderDisplayLabel(folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>) {
  return READWISE_EXTERNAL_FOLDER_LABELS[folder.id] ?? resolveExternalFolderLabel(folder.folderPath);
}

export function resolveReadwiseExternalChildLabel(folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>) {
  return READWISE_EXTERNAL_CHILD_LABELS[folder.id] ?? resolveExternalFolderLabel(folder.folderPath);
}

export function resolveExternalEntryDirectoryPath(relativePath: string) {
  const normalizedPath = normalizeExternalDirectoryPath(relativePath);
  const segments = normalizedPath.split('/');
  segments.pop();
  return segments.join('/');
}

function collectDirectoryPaths(entries: ExternalLibraryBrowseEntry[]) {
  const paths = new Set<string>();
  entries.forEach((entry) => {
    const segments = resolveExternalEntryDirectoryPath(entry.relativePath).split('/').filter(Boolean);
    let currentPath = '';
    segments.forEach((segment) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      paths.add(currentPath);
    });
  });
  return [...paths].sort(compareDirectoryPath);
}

function compareDirectoryPath(left: string, right: string) {
  const leftSegments = normalizeExternalDirectoryPath(left).split('/').filter(Boolean);
  const rightSegments = normalizeExternalDirectoryPath(right).split('/').filter(Boolean);
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const result = compareNaturalName(leftSegments[index] ?? '', rightSegments[index] ?? '');
    if (result !== 0) return result;
  }
  return leftSegments.length - rightSegments.length;
}

function buildDirectoryNode(folder: ExternalLibraryFolder, directoryPath: string, entries: ExternalLibraryBrowseEntry[]) {
  const normalizedDirectoryPath = normalizeExternalDirectoryPath(directoryPath);
  const documentCount = entries.filter((entry) => {
    const entryDirectoryPath = resolveExternalEntryDirectoryPath(entry.relativePath);
    return entryDirectoryPath === normalizedDirectoryPath || entryDirectoryPath.startsWith(`${normalizedDirectoryPath}/`);
  }).length;
  const childPrefix = normalizedDirectoryPath ? `${normalizedDirectoryPath}/` : '';
  const hasChildren = entries.some((entry) => {
    const entryDirectoryPath = resolveExternalEntryDirectoryPath(entry.relativePath);
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
    name: normalizedDirectoryPath.split('/').filter(Boolean).at(-1) ?? resolveExternalFolderDisplayLabel(folder),
    parentDirectoryPath: normalizedDirectoryPath.includes('/')
      ? normalizedDirectoryPath.slice(0, normalizedDirectoryPath.lastIndexOf('/'))
      : null
  } satisfies ExternalLibraryDirectoryNode;
}

function resolveSelectedDirectoryPath(
  entries: ExternalLibraryBrowseEntry[],
  selection: Extract<ExternalLibrarySelection, { folderId: string }>
) {
  if (selection.kind === 'folder') {
    return '';
  }
  if (selection.kind === 'directory') {
    return normalizeExternalDirectoryPath(selection.directoryPath);
  }
  const documentEntry = entries.find((entry) => entry.absolutePath === selection.absolutePath);
  return resolveExternalEntryDirectoryPath(documentEntry?.relativePath ?? '');
}

function listDocumentsForDirectory(entries: ExternalLibraryBrowseEntry[], selectedDirectoryPath: string) {
  const directoryPrefix = selectedDirectoryPath ? `${selectedDirectoryPath}/` : '';
  return entries
    .filter((entry) => {
      const entryDirectoryPath = resolveExternalEntryDirectoryPath(entry.relativePath);
      return selectedDirectoryPath
        ? entryDirectoryPath === selectedDirectoryPath || entryDirectoryPath.startsWith(directoryPrefix)
        : true;
    })
    .map((entry) => ({ ...entry }));
}

export function buildExternalLibraryFolderBrowseState<TFolder extends ExternalLibraryFolder>(
  folder: TFolder,
  entries: ExternalLibraryBrowseEntry[],
  selection: Extract<ExternalLibrarySelection, { folderId: string }>
): ExternalLibraryFolderBrowseState & { folder: TFolder } {
  const selectedDirectoryPath = resolveSelectedDirectoryPath(entries, selection);
  return {
    directoryNodes: collectDirectoryPaths(entries).map((directoryPath) => buildDirectoryNode(folder, directoryPath, entries)),
    documentItems: listDocumentsForDirectory(entries, selectedDirectoryPath),
    folder,
    selectedDirectoryPath: selectedDirectoryPath || null
  };
}
