import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReaderDocumentContract } from '../../lib/core/readwise/readwiseApiContract.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { readReadwiseApiSourceDisposition } from '../database/readwiseApiSourceDispositions.js';

import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import { clearReadwiseSourceCutoverActiveDocument, recordReadwiseSuppressedCutoverDocuments } from './readwiseSourceCutoverClassification.js';
import { requireReadwiseSourceCutoverV2 } from './readwiseSourceCutoverJournal.js';

export function prepareReadwiseSourceCutoverRouting(input: {
  artifactFor: (documentId: string) => unknown;
  connectionRef: string;
  documents: PreparedReadwiseApiDocument[];
  dispositionSuppressed: ReadonlySet<string>;
  readersById: ReadonlyMap<string, ReaderDocumentContract>;
  settings: ImportManagerSettings;
}) {
  const destinations = new Map<string, 'external' | 'inbox' | 'off'>();
  const suppressed = new Set([...input.dispositionSuppressed]
    .filter((documentId) => !input.artifactFor(documentId)));
  const driver = openDatabaseConnection().driver;
  for (const document of input.documents) {
    const matchedArtifact = input.artifactFor(document.id);
    const alreadySuppressed = Boolean(readReadwiseApiSourceDisposition(
      driver, input.connectionRef, document.id
    ));
    const destination = matchedArtifact
      ? 'inbox'
      : alreadySuppressed ? 'off'
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
