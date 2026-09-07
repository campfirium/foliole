import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';

import { getExternalFolderRuntimeProvider } from './externalFolderRuntime';
import {
  importRuntimeExternalSearchDocument,
  refreshRuntimeExternalSearchFolders
} from './externalSearchRuntimeRepository';

export type ExternalDocumentImportResult = NativeTextImportResult;

export function importExternalDocument(absolutePath: string) {
  return getExternalFolderRuntimeProvider().importDocument(absolutePath).then(async (providerResult) => {
    const result = providerResult ?? await importRuntimeExternalSearchDocument(absolutePath);
    if (result?.node_id) await refreshRuntimeExternalSearchFolders();
    return result;
  });
}
