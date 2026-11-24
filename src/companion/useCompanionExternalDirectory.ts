import { useEffect, useState, useSyncExternalStore } from 'react';

import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import {
  getCompanionExternalVisibilityRevision, subscribeCompanionExternalVisibility
} from '../shared/platform/companion/sync/companionExternalVisibility';
import {
  loadCompanionExternalDirectory,
  loadCompanionExternalDocument,
  type CompanionExternalDirectory,
  type CompanionExternalDocument
} from '../shared/platform/companionExternalDocuments';

import type { CompanionDirectorySelection } from './CompanionDirectoryModel';

const emptyDirectory: CompanionExternalDirectory = { entries: [], folders: [] };
type LibraryRevision = { scope: object; revision: number };

function useExternalLibraryRevision() {
  return {
    scope: useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope),
    revision: useSyncExternalStore(subscribeCompanionExternalVisibility, getCompanionExternalVisibilityRevision)
  };
}

export function useCompanionExternalDirectory() {
  const { scope, revision } = useExternalLibraryRevision();
  const [loaded, setLoaded] = useState<(LibraryRevision & { directory: CompanionExternalDirectory }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCompanionExternalDirectory().then(directory => {
      if (!cancelled) setLoaded({ scope, revision, directory });
    }).catch(() => {
      if (!cancelled) setLoaded({ scope, revision, directory: emptyDirectory });
    });
    return () => { cancelled = true; };
  }, [scope, revision]);

  return loaded?.scope === scope && loaded.revision === revision ? loaded.directory : emptyDirectory;
}

export function useCompanionExternalDocument(selection: CompanionDirectorySelection) {
  const { scope, revision } = useExternalLibraryRevision();
  const id = selection.kind === 'externalDocument' ? selection.documentId : null;
  const [loaded, setLoaded] = useState<(LibraryRevision & { id: string; document: CompanionExternalDocument | null }) | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    void loadCompanionExternalDocument(id).then(document => {
      if (!cancelled) setLoaded({ scope, revision, id, document });
    }).catch(() => {
      if (!cancelled) setLoaded({ scope, revision, id, document: null });
    });
    return () => { cancelled = true; };
  }, [scope, revision, id]);

  return loaded?.scope === scope && loaded.revision === revision && loaded.id === id ? loaded.document : undefined;
}
