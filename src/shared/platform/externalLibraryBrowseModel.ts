import { buildExternalLibraryDirectoryNodes } from './externalLibraryDirectoryNodes';

export interface ExternalLibraryBrowseEntry {
  absolutePath: string;
  editable?: boolean | undefined;
  extension: 'md' | 'txt';
  fileName: string;
  fileSize?: number | null;
  folderId: string;
  importedNodeId?: string | null;
  isPresent?: boolean | undefined;
  lastOpenedAt?: string | null;
  modifiedAt: string;
  openingText: string | null;
  relativePath: string;
  sourceKind?: 'external_document' | 'local_file' | undefined;
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
  | {
    absolutePath: string;
    folderId: string;
    kind: 'document';
    sourceKind?: 'external_document' | 'local_file' | undefined;
  };

export interface ExternalLibraryFolderBrowseState {
  directoryNodes: ExternalLibraryDirectoryNode[];
  documentItems: ExternalLibraryDocumentItem[];
  folder: ExternalLibraryFolder;
  selectedDirectoryPath: string | null;
}

function compareNaturalName(left: string, right: string) {
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

const OPENED_EXTERNAL_FOLDER_LABELS: Record<string, string> = {
  'opened-external-documents': 'Opened'
};

export function isReadwiseExternalFolder(folder: Pick<ExternalLibraryFolder, 'id'>) {
  return Object.prototype.hasOwnProperty.call(READWISE_EXTERNAL_FOLDER_LABELS, folder.id);
}

export function resolveExternalFolderDisplayLabel(folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>) {
  return OPENED_EXTERNAL_FOLDER_LABELS[folder.id] ?? READWISE_EXTERNAL_FOLDER_LABELS[folder.id] ?? resolveExternalFolderLabel(folder.folderPath);
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

function buildDirectoryNodes(folder: ExternalLibraryFolder, entries: ExternalLibraryBrowseEntry[]) {
  return buildExternalLibraryDirectoryNodes(folder, entries, {
    compareNaturalName,
    normalizeDirectoryPath: normalizeExternalDirectoryPath,
    resolveEntryDirectoryPath: resolveExternalEntryDirectoryPath,
    resolveFolderDisplayLabel: resolveExternalFolderDisplayLabel
  });
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
    directoryNodes: buildDirectoryNodes(folder, entries),
    documentItems: listDocumentsForDirectory(entries, selectedDirectoryPath),
    folder,
    selectedDirectoryPath: selectedDirectoryPath || null
  };
}
