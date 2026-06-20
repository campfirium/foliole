import type { NativeTextImportResult } from '../../../../lib/platform/nativeImportContract';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder,
  RuntimeExternalSearchPreview
} from '../externalSearchRuntimeRepository';

export interface ExternalFolderRuntimeProvider {
  importDocument: (absolutePath: string) => Promise<NativeTextImportResult | null>;
  loadBrowseEntries: (folderId: string) => Promise<RuntimeExternalSearchBrowseEntry[] | null>;
  loadFolders: () => Promise<RuntimeExternalSearchFolder[] | null>;
  loadPreview: (
    absolutePath: string,
    options?: { folderId?: string | undefined; sourceKind?: 'external_document' | 'local_file' | undefined }
  ) => Promise<RuntimeExternalSearchPreview | null>;
  rebuildIndex: (folderId?: string) => Promise<RuntimeExternalSearchFolder[] | null>;
  saveFolders: (folders: RuntimeExternalSearchFolder[]) => Promise<RuntimeExternalSearchFolder[] | null>;
  selectFolderPath: () => Promise<string | null>;
  subscribeFolders: (listener: (folders: RuntimeExternalSearchFolder[]) => void) => () => void;
}

const defaultProvider: ExternalFolderRuntimeProvider = {
  importDocument: () => Promise.resolve(null),
  loadBrowseEntries: () => Promise.resolve(null),
  loadFolders: () => Promise.resolve(null),
  loadPreview: () => Promise.resolve(null),
  rebuildIndex: () => Promise.resolve(null),
  saveFolders: () => Promise.resolve(null),
  selectFolderPath: () => Promise.resolve(null),
  subscribeFolders: () => () => undefined
};

let activeProvider = defaultProvider;

export function installExternalFolderRuntimeProvider(provider: ExternalFolderRuntimeProvider) {
  activeProvider = provider;
}

export function resetExternalFolderRuntimeProviderForTest() {
  activeProvider = defaultProvider;
}

export function getExternalFolderRuntimeProvider() {
  return activeProvider;
}
