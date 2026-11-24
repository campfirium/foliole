import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import {
  getCompanionExternalVisibility, subscribeCompanionExternalVisibility, wasCompanionExternalFolderHidden
} from '../shared/platform/companion/sync/companionExternalVisibility';
import {
  loadCompanionExternalDirectory,
  loadCompanionExternalDocument,
  type CompanionExternalDirectory,
  type CompanionExternalDocument
} from '../shared/platform/companionExternalDocuments';

const emptyDirectory: CompanionExternalDirectory = { entries: [], folders: [] };
type LibraryRevision = { scope: object; revision: number };

function useExternalLibraryRevision() {
  return {
    scope: useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope),
    visibility: useSyncExternalStore(subscribeCompanionExternalVisibility, getCompanionExternalVisibility)
  };
}

export function useCompanionExternalDirectory() {
  const { scope, visibility } = useExternalLibraryRevision();
  const { revision } = visibility;
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

  return useMemo(() => {
    if (loaded?.scope !== scope) return emptyDirectory;
    if (loaded.revision === revision) return loaded.directory;
    const visible = (id: string) => !wasCompanionExternalFolderHidden(id, loaded.revision, visibility);
    return {
      entries: loaded.directory.entries.filter(entry => visible(entry.folderId)),
      folders: loaded.directory.folders.filter(folder => visible(folder.id))
    };
  }, [loaded, scope, revision, visibility]);
}

export function useCompanionExternalDocument(id: string | null) {
  const { scope, visibility } = useExternalLibraryRevision();
  const { revision } = visibility;
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

  if (loaded?.scope !== scope || loaded.id !== id) return undefined;
  if (loaded.document && wasCompanionExternalFolderHidden(loaded.document.folder_id, loaded.revision, visibility)) return null;
  return loaded.document;
}
