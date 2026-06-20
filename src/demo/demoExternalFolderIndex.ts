import type { NativeTextImportResult } from '../../lib/platform/nativeImportContract';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder,
  RuntimeExternalSearchPreview
} from '../shared/platform/externalSearchRuntimeRepository';
import { useWorkspaceStore } from '../store/workspaceStore';

import { DEMO_CAPTURED_VERSION } from './demoLocalStorage';
import { applyDemoMarkdownImport } from './demoMarkdownImport';
import { isHiddenPath } from './demoMarkdownImportBuild';

export type BrowserDirectoryHandle = {
  entries: () => AsyncIterable<[string, BrowserFileHandle | BrowserDirectoryHandle]>;
  kind: 'directory';
  name: string;
};

export type BrowserFileHandle = {
  getFile: () => Promise<File>;
  kind: 'file';
  name: string;
};

export interface DemoExternalFileRecord {
  fileHandle: BrowserFileHandle;
  folder: RuntimeExternalSearchFolder;
  locator: string;
  relativePath: string;
}

const MAX_TOP_LEVEL_ENTRIES = 400;
const MAX_INDEX_MS = 1200;

export async function indexTopLevelFolder(directoryHandle: BrowserDirectoryHandle) {
  const nowIso = new Date().toISOString();
  const folderId = `demo-external-${crypto.randomUUID()}`;
  const folderPath = directoryHandle.name;
  const entries: RuntimeExternalSearchBrowseEntry[] = [];
  const records: DemoExternalFileRecord[] = [];
  const startedAt = performance.now();
  let visitedEntryCount = 0;

  for await (const [name, handle] of directoryHandle.entries()) {
    visitedEntryCount += 1;
    if (visitedEntryCount > MAX_TOP_LEVEL_ENTRIES || performance.now() - startedAt > MAX_INDEX_MS) break;
    if (handle.kind !== 'file' || isHiddenPath(name) || !isSupportedExternalFileName(name)) continue;
    const file = await handle.getFile();
    const locator = createExternalLocator(folderId, name);
    const folder = createFolder(folderId, folderPath, entries.length + 1, nowIso);
    entries.push(createBrowseEntry({ file, folderId, folderPath, locator, relativePath: name }));
    records.push({ fileHandle: handle, folder, locator, relativePath: name });
  }

  const folder = createFolder(folderId, folderPath, entries.length, nowIso);
  return { entries, folder, records: records.map((record) => ({ ...record, folder })) };
}

export async function loadDemoExternalPreview(record: DemoExternalFileRecord | null) {
  if (!record) return null;
  const file = await record.fileHandle.getFile();
  return {
    absolutePath: record.locator,
    content: await readFileText(file),
    editable: false,
    extension: getExternalFileExtension(file.name),
    fileName: file.name,
    fileSize: file.size,
    folderId: record.folder.id,
    folderPath: record.folder.folderPath,
    importedNodeId: null,
    isPresent: true,
    lastOpenedAt: null,
    modifiedAt: new Date(file.lastModified).toISOString(),
    relativePath: record.relativePath,
    sourceKind: 'external_document'
  } satisfies RuntimeExternalSearchPreview;
}

export async function importDemoExternalDocument(record: DemoExternalFileRecord | null) {
  if (!record) return null;
  const file = await record.fileHandle.getFile();
  const nowIso = new Date().toISOString();
  const result = applyDemoMarkdownImport(
    useWorkspaceStore.getState(),
    [{ markdown: await readFileText(file), relativePath: record.relativePath, sourceName: file.name }],
    nowIso
  );
  if (result.importedTopicIds.length > 0) {
    useWorkspaceStore.setState(result.state);
  }
  return createImportResult(record.locator, file, nowIso, result.importedTopicIds[0] ?? null);
}

function createFolder(id: string, folderPath: string, documentCount: number, timestamp: string) {
  return {
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: timestamp,
    documentCount,
    excludedDirs: [],
    folderPath,
    id,
    indexedAt: timestamp,
    lastError: null,
    status: 'ready',
    updatedAt: timestamp
  } satisfies RuntimeExternalSearchFolder;
}

function createBrowseEntry(args: {
  file: File;
  folderId: string;
  folderPath: string;
  locator: string;
  relativePath: string;
}) {
  return {
    absolutePath: args.locator,
    editable: false,
    extension: getExternalFileExtension(args.file.name),
    fileName: args.file.name,
    fileSize: args.file.size,
    folderId: args.folderId,
    folderPath: args.folderPath,
    importedNodeId: null,
    isPresent: true,
    lastOpenedAt: null,
    modifiedAt: new Date(args.file.lastModified).toISOString(),
    openingText: null,
    relativePath: args.relativePath,
    sourceKind: 'external_document',
    title: stripSupportedExtension(args.file.name)
  } satisfies RuntimeExternalSearchBrowseEntry;
}

function createImportResult(locator: string, file: File, importedAt: string, nodeId: string | null) {
  const fingerprint = `${DEMO_CAPTURED_VERSION}:${locator}:${file.size}:${file.lastModified}`;
  return {
    content_fingerprint: fingerprint,
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: crypto.randomUUID(),
    imported_at: importedAt,
    node_id: nodeId,
    provider: 'desktop_text_file',
    result_status: nodeId ? 'imported' : 'failed',
    source_fingerprint: fingerprint,
    source_kind: getExternalFileExtension(file.name) === 'txt' ? 'text' : 'markdown',
    source_locator: locator,
    source_name: file.name
  } satisfies NativeTextImportResult;
}

function createExternalLocator(folderId: string, fileName: string) {
  return `demo-external://${folderId}/${encodeURIComponent(fileName)}`;
}

function getExternalFileExtension(fileName: string): 'md' | 'txt' {
  return fileName.toLocaleLowerCase().endsWith('.txt') ? 'txt' : 'md';
}

function isSupportedExternalFileName(fileName: string) {
  return /\.(md|txt)$/i.test(fileName);
}

function stripSupportedExtension(fileName: string) {
  return fileName.replace(/\.(md|txt)$/i, '');
}

function readFileText(file: File) {
  if ('text' in file && typeof file.text === 'function') {
    return file.text();
  }
  return new Response(file).text();
}
