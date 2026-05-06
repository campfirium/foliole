import {
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchPreview
} from './externalSearchRuntimeRepository';

export type ExternalDocumentPreview = RuntimeExternalSearchPreview;

export function loadExternalDocumentPreview(absolutePath: string) {
  return loadRuntimeExternalSearchPreview(absolutePath);
}
