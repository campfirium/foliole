import { useEffect, useRef, useState } from 'react';

import { syncCompanionContentBlobFromDesktop } from '../shared/platform/companionDesktopSyncObjects';
import { saveCompanionSyncActiveViewState } from '../shared/platform/companionSyncObjects';

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
    const previousArticleNodeId = currentArticleNodeIdRef.current;
    const nextArticleNodeId = args.readableArticle?.nodeId ?? null;
    if (nextArticleNodeId && previousArticleNodeId !== nextArticleNodeId) {
      const retryPrefix = `${nextArticleNodeId}:`;
      for (const syncKey of attemptedBodySyncKeysRef.current) {
        if (syncKey.startsWith(retryPrefix)) {
          attemptedBodySyncKeysRef.current.delete(syncKey);
        }
      }
    }
    currentArticleNodeIdRef.current = nextArticleNodeId;
  }, [args.readableArticle?.nodeId]);

  useEffect(() => {
    const article = args.readableArticle;
    const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.workspaceSync.state);
    if (!article?.bodyBlobHash || !endpointUrl) return;
    if (article.bodyStatus !== 'missing' && article.bodyStatus !== 'failed') return;

    const bodyBlobHash = article.bodyBlobHash;
    const syncKey = `${article.nodeId}:${bodyBlobHash}:${article.bodyStatus}`;
    if (attemptedBodySyncKeysRef.current.has(syncKey)) return;
    attemptedBodySyncKeysRef.current.add(syncKey);
    setFetchingBodyKey(syncKey);

    void saveCompanionSyncActiveViewState(article.nodeId)
      .catch(() => undefined)
      .then(() => syncCompanionContentBlobFromDesktop(endpointUrl, bodyBlobHash))
      .then(async (result) => {
        if (currentArticleNodeIdRef.current === article.nodeId) {
          await args.workspaceSync.refreshFromDevice();
        }
        if (result.availability === 'cached' && args.workspaceSync.status !== 'syncing') {
          void args.workspaceSync.pullFromDesktop(endpointUrl).catch(() => undefined);
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
