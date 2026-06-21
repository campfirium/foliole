import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../shared/platform/externalSearchRuntimeRepository';
import type { ExternalFolderRuntimeProvider } from '../shared/platform/runtime/externalFolderRuntime';

import {
  type BrowserDirectoryHandle,
  type DemoExternalFileRecord,
  importDemoExternalDocument,
  indexTopLevelFolder,
  loadDemoExternalPreview
} from './demoExternalFolderIndex';

type BrowserWindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>;
};

interface DemoExternalFolderProviderState {
  entriesByFolderId: Map<string, RuntimeExternalSearchBrowseEntry[]>;
  fileRecords: Map<string, DemoExternalFileRecord>;
  folderHandles: Map<string, BrowserDirectoryHandle>;
  folders: RuntimeExternalSearchFolder[];
  listeners: Set<(folders: RuntimeExternalSearchFolder[]) => void>;
}

export function createDemoExternalFolderProvider(): ExternalFolderRuntimeProvider {
  const state = createProviderState();
  return {
    importDocument: (absolutePath) => importDemoExternalDocument(state.fileRecords.get(absolutePath) ?? null),
    loadBrowseEntries: (folderId) => Promise.resolve(state.entriesByFolderId.get(folderId) ?? []),
    loadFolders: () => Promise.resolve(state.folders),
    loadPreview: (absolutePath) => loadDemoExternalPreview(state.fileRecords.get(absolutePath) ?? null),
    rebuildIndex: (folderId) => rebuildIndex(state, folderId),
    saveFolders: (folders) => saveFolders(state, folders),
    selectFolderPath: () => selectFolderPath(state),
    subscribeFolders: (listener) => subscribeFolders(state, listener)
  };
}

function createProviderState(): DemoExternalFolderProviderState {
  return {
    entriesByFolderId: new Map(),
    fileRecords: new Map(),
    folderHandles: new Map(),
    folders: [],
    listeners: new Set()
  };
}

async function indexFolder(state: DemoExternalFolderProviderState, directoryHandle: BrowserDirectoryHandle) {
  const indexed = await indexTopLevelFolder(directoryHandle);
  state.folderHandles.set(indexed.folder.id, directoryHandle);
  state.entriesByFolderId.set(indexed.folder.id, indexed.entries);
  indexed.records.forEach((record) => state.fileRecords.set(record.locator, record));
  state.folders = [...state.folders.filter((folder) => folder.folderPath !== indexed.folder.folderPath), indexed.folder];
  notifyFolders(state);
  return indexed.folder.folderPath;
}

async function rebuildIndex(state: DemoExternalFolderProviderState, folderId?: string) {
  const targetIds = folderId ? [folderId] : [...state.folderHandles.keys()];
  for (const targetId of targetIds) {
    const handle = state.folderHandles.get(targetId);
    if (handle) await indexFolder(state, handle);
  }
  return state.folders;
}

function saveFolders(state: DemoExternalFolderProviderState, nextFolders: RuntimeExternalSearchFolder[]) {
  const nextIds = new Set(nextFolders.map((folder) => folder.id));
  state.folders = nextFolders.length === 0
    ? []
    : state.folders.filter((folder) =>
      nextIds.has(folder.id) || nextFolders.some((candidate) => candidate.folderPath === folder.folderPath)
    );
  notifyFolders(state);
  return Promise.resolve(state.folders);
}

async function selectFolderPath(state: DemoExternalFolderProviderState) {
  const picker = (window as BrowserWindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) throw new Error('This browser does not support choosing folders in the Live Demo.');
  try {
    return await indexFolder(state, await picker());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

function subscribeFolders(
  state: DemoExternalFolderProviderState,
  listener: (folders: RuntimeExternalSearchFolder[]) => void
) {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function notifyFolders(state: DemoExternalFolderProviderState) {
  state.listeners.forEach((listener) => listener(state.folders));
}
