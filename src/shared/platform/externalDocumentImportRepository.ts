import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';

import { importRuntimeExternalSearchDocument } from './externalSearchRuntimeRepository';
import { getExternalFolderRuntimeProvider } from './runtime/externalFolderRuntime';

export type ExternalDocumentImportResult = NativeTextImportResult;

export function importExternalDocument(absolutePath: string) {
  return getExternalFolderRuntimeProvider().importDocument(absolutePath).then((result) =>
    result ?? importRuntimeExternalSearchDocument(absolutePath)
  );
}
