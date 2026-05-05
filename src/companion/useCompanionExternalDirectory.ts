import { useEffect, useState } from 'react';

import {
  loadCompanionExternalDirectory,
  loadCompanionExternalDocument,
  type CompanionExternalDirectory
} from '../shared/platform/companionExternalDocuments';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';

export function useCompanionExternalDirectory() {
  const [directory, setDirectory] = useState<CompanionExternalDirectory>({ entries: [], folders: [] });

  useEffect(() => {
    let cancelled = false;
    void loadCompanionExternalDirectory().then((nextDirectory) => {
      if (!cancelled) setDirectory(nextDirectory);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return directory;
}

export function useCompanionExternalDocument(selection: CompanionDirectorySelection) {
  const [document, setDocument] = useState<Awaited<ReturnType<typeof loadCompanionExternalDocument>>>(null);

  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    if (selection.kind !== 'externalDocument') {
      return () => {
        cancelled = true;
      };
    }
    void loadCompanionExternalDocument(selection.documentId).then((nextDocument) => {
      if (!cancelled) setDocument(nextDocument);
    });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  return document;
}
