import { useEffect, useRef, useState } from 'react';

import { syncCompanionContentBlobFromDesktop } from '../shared/platform/companionDesktopSyncObjects';

import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionMissingBodySync(args: {
  readableArticle: CompanionWorkspaceSyncApi['readableArticle'];
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  const attemptedBodySyncKeysRef = useRef(new Set<string>());
  const currentArticleNodeIdRef = useRef<string | null>(null);
  const [fetchingBodyKey, setFetchingBodyKey] = useState<string | null>(null);

  useEffect(() => {
    currentArticleNodeIdRef.current = args.readableArticle?.nodeId ?? null;
  }, [args.readableArticle?.nodeId]);

  useEffect(() => {
    const article = args.readableArticle;
    const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.workspaceSync.state);
    if (!article?.bodyBlobHash || !endpointUrl) return;
    if (article.bodyStatus !== 'missing' && article.bodyStatus !== 'failed') return;

    const syncKey = `${article.nodeId}:${article.bodyBlobHash}:${article.bodyStatus}`;
    if (attemptedBodySyncKeysRef.current.has(syncKey)) return;
    attemptedBodySyncKeysRef.current.add(syncKey);
    setFetchingBodyKey(syncKey);

    void syncCompanionContentBlobFromDesktop(endpointUrl, article.bodyBlobHash)
      .then(async () => {
        if (currentArticleNodeIdRef.current === article.nodeId) {
          await args.workspaceSync.refreshFromDevice();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setFetchingBodyKey((currentKey) => currentKey === syncKey ? null : currentKey);
      });
  }, [
    args.readableArticle?.bodyBlobHash,
    args.readableArticle?.bodyStatus,
    args.readableArticle?.nodeId,
    args.workspaceSync
  ]);

  return {
    fetchingBodyKey
  };
}
