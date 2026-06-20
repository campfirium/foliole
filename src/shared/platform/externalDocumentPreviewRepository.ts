import {
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchPreview
} from './externalSearchRuntimeRepository';
import { getExternalFolderRuntimeProvider } from './runtime/externalFolderRuntime';

export type ExternalDocumentPreview = RuntimeExternalSearchPreview;

export function loadExternalDocumentPreview(
  absolutePath: string,
  options: {
    folderId?: string | undefined;
    sourceKind?: 'external_document' | 'local_file' | undefined;
  } = {}
) {
  return getExternalFolderRuntimeProvider().loadPreview(absolutePath, options).then((preview) =>
    preview ?? loadRuntimeExternalSearchPreview(absolutePath, options)
  );
}
