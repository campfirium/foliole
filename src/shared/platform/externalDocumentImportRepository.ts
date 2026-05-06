import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';

import { importRuntimeExternalSearchDocument } from './externalSearchRuntimeRepository';

export type ExternalDocumentImportResult = NativeTextImportResult;

export function importExternalDocument(absolutePath: string) {
  return importRuntimeExternalSearchDocument(absolutePath);
}
