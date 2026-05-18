import { useEffect, type Dispatch, type SetStateAction } from 'react';

import {
  loadExternalLibraryBrowseEntries,
  loadExternalLibraryFolders,
  subscribeExternalLibraryDocumentFileOpened,
  type ExternalLibraryBrowseEntry,
  type ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import type { ExternalLibrarySelection } from '../components/externalLibraryBrowseModel';

import type { useExternalLibraryViewHistory } from './externalLibraryViewHistory';

export function useExternalDocumentFileOpenEvents(args: {
  folders: ExternalLibraryFolder[];
  history: Pick<ReturnType<typeof useExternalLibraryViewHistory>, 'openExternalTarget'>;
  retainEntriesForCurrentFolders: (
    current: Record<string, ExternalLibraryBrowseEntry[] | undefined>,
    previousFolders: ExternalLibraryFolder[],
    nextFolders: ExternalLibraryFolder[]
  ) => Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  setEntriesByFolderId: Dispatch<SetStateAction<Record<string, ExternalLibraryBrowseEntry[] | undefined>>>;
  setFolders: Dispatch<SetStateAction<ExternalLibraryFolder[]>>;
}) {
  useEffect(
    () =>
      subscribeExternalLibraryDocumentFileOpened((payload) => {
        if (!payload.absolutePath || !payload.folderId) return;
        void loadExternalLibraryFolders().then((result) => {
          if (result) {
            args.setEntriesByFolderId((current) =>
              args.retainEntriesForCurrentFolders(current, args.folders, result)
            );
            args.setFolders(result);
          }
        });
        void loadExternalLibraryBrowseEntries(payload.folderId).then((result) => {
          if (result !== null) {
            args.setEntriesByFolderId((current) => ({ ...current, [payload.folderId]: result }));
          }
        });
        args.history.openExternalTarget({
          absolutePath: payload.absolutePath,
          folderId: payload.folderId,
          kind: 'document'
        } satisfies ExternalLibrarySelection);
      }),
    [args]
  );
}
