import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';

import { getExternalFolderRuntimeProvider } from './externalFolderRuntime';
import { importRuntimeExternalSearchDocument } from './externalSearchRuntimeRepository';

export type ExternalDocumentImportResult = NativeTextImportResult;

export function importExternalDocument(absolutePath: string) {
  return getExternalFolderRuntimeProvider().importDocument(absolutePath).then((result) =>
    result ?? importRuntimeExternalSearchDocument(absolutePath)
  );
}
