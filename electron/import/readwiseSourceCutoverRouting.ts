import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import { clearReadwiseSourceCutoverActiveDocument, recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { requireReadwiseSourceCutoverV2 } from './readwiseSourceCutoverJournal.js';

export function prepareReadwiseSourceCutoverRouting(input: {
  artifactFor: (documentId: string) => unknown;
  documents: PreparedReadwiseApiDocument[];
  dispositionSuppressed: ReadonlySet<string>;
  readersById: ReadonlyMap<string, ReaderDocumentContract>;
  settings: ImportManagerSettings;
}) {
  const destinations = new Map<string, 'external' | 'inbox' | 'off'>();
  const suppressed = new Set(input.dispositionSuppressed);
  for (const document of input.documents) {
    const destination = input.artifactFor(document.id)
      ? 'inbox'
      : resolveReadwiseAutoImportDestination(
          input.settings.readwiseAutoImportPolicy,
          document.category,
          document.annotations.length > 0,
          matchesReadwiseDocumentImportTag(
            input.readersById.get(document.id)?.tags,
            input.settings.readwiseAutoImportPolicy.importTag
          )
        );
    destinations.set(document.id, destination);
    if (destination === 'off') suppressed.add(document.id);
  }
  recordReadwiseSuppressedCutoverDocuments(input.documents, suppressed);
  const current = requireReadwiseSourceCutoverV2();
  const terminalDocumentIds = new Set(current.documents.map((item) => item.remoteId));
  if (current.activeDocument && terminalDocumentIds.has(current.activeDocument.remoteId)) {
    clearReadwiseSourceCutoverActiveDocument(current.activeDocument.remoteId);
  }
  return { destinations, terminalDocumentIds };
}
