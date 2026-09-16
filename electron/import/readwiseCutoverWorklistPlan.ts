import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseSourceCutoverClassification } from '../../lib/core/readwise/readwiseSourceCutover.js';

import type { ReadwiseSourceCutoverIdentityBinding } from './readwiseSourceCutoverIdentity.js';

type Binding = Omit<ReadwiseSourceCutoverIdentityBinding, 'blockedAnnotationIds'> & {
  blockedAnnotationIds: string[];
};
export interface CutoverWorkItem {
  binding: Binding | null;
  destination: 'external' | 'inbox';
  remoteId: string;
}
export interface CutoverWorklistSummary {
  newImport: number;
  skipped: number;
  updateExisting: number;
}

export function planCutoverWorklist(
  documents: PreparedReadwiseApiDocument[],
  destinations: Map<string, 'external' | 'inbox' | 'off'>,
  bindingFor: (document: PreparedReadwiseApiDocument) => ReadwiseSourceCutoverIdentityBinding | null,
  previousDocuments: ReadwiseSourceCutoverClassification[],
  failedDocumentIds: ReadonlySet<string>
): { items: CutoverWorkItem[]; summary: CutoverWorklistSummary } {
  const previous = new Map(previousDocuments.map((item) => [item.remoteId, item]));
  const items = documents.flatMap((document): CutoverWorkItem[] => {
    const binding = bindingFor(document);
    if (binding) return [{
      binding: { ...binding, blockedAnnotationIds: [...(binding.blockedAnnotationIds ?? [])] },
      destination: 'inbox', remoteId: document.id
    }];
    const terminal = previous.get(document.id);
    if (terminal?.status === 'suppressed' ||
      (terminal?.status === 'blocked' && !failedDocumentIds.has(document.id))) return [];
    const destination = terminal
      ? terminal.status === 'external' ? 'external' : 'inbox'
      : destinations.get(document.id) ?? 'off';
    return destination === 'off' ? [] : [{ binding: null, destination, remoteId: document.id }];
  });
  const updateExisting = items.filter((item) => item.binding).length;
  return {
    items,
    summary: {
      newImport: items.length - updateExisting,
      skipped: documents.length - items.length,
      updateExisting
    }
  };
}
