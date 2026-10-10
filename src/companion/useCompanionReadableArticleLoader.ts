import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingDemandKey, CompanionReadingSnapshotChanged } from '../shared/platform/companion/reading/companionReadingDemand';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionReadableArticle } from '../shared/platform/companionWorkspaceSync';

type Article = CompanionReadableArticle | null;
interface Request {
  article?: Article;
  key: string;
  nodeId: string;
  promise: Promise<Article>;
  scope: object;
}
interface DisplayedArticle {
  article: Article;
  libraryScope: string | undefined;
  nodeId: string;
  scope: object;
}

function useArticleInvalidation(snapshot: WorkspaceSnapshot | null,
  latestSnapshot: MutableRefObject<WorkspaceSnapshot | null>,
  current: MutableRefObject<Request | null>, displayed: MutableRefObject<DisplayedArticle | null>,
  release: () => void) {
  useLayoutEffect(() => {
    latestSnapshot.current = snapshot;
    const visible = displayed.current;
    if (visible && (visible.libraryScope !== snapshot?.libraryScope ||
      !companionReadingDemandKey(snapshot, visible.nodeId))) release();
    const request = current.current;
    if (request && request.key !== companionReadingDemandKey(snapshot, request.nodeId)) {
      current.current = null;
      if (!companionReadingDemandKey(snapshot, request.nodeId)) release();
    }
  }, [current, displayed, latestSnapshot, release, snapshot]);
}

function useReadingLifetime(
  current: MutableRefObject<Request | null>,
  release: () => void,
  onSnapshotChanged?: () => Promise<unknown>
) {
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeCompanionReadingScope(release);
    return () => {
      mounted.current = false;
      current.current = null;
      unsubscribe();
    };
  }, [current, release]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void subscribeNativeAppForeground(() => {
      if (current.current) void onSnapshotChanged?.().catch(() => undefined);
    }).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else cleanup = unsubscribe;
    });
    return () => { disposed = true; cleanup?.(); };
  }, [current, onSnapshotChanged]);
  return mounted;
}

export function useCompanionReadableArticleLoader(
  snapshot: WorkspaceSnapshot | null,
  setReadableArticle: (article: Article) => void,
  onSnapshotChanged?: () => Promise<unknown>,
  onError?: (message: string) => void
) {
  const latestSnapshot = useRef(snapshot);
  const current = useRef<Request | null>(null);
  const displayed = useRef<DisplayedArticle | null>(null);
  const refreshedKey = useRef<string | null>(null);
  const release = useCallback(() => {
    current.current = null;
    displayed.current = null;
    setReadableArticle(null);
  }, [setReadableArticle]);
  useArticleInvalidation(snapshot, latestSnapshot, current, displayed, release);
  const mounted = useReadingLifetime(current, release, onSnapshotChanged);

  const openReadableArticle = useCallback((nodeId: string | null): Promise<Article> => {
    const key = companionReadingDemandKey(snapshot, nodeId);
    if (!nodeId || !key) {
      refreshedKey.current = null;
      release();
      return Promise.resolve(null);
    }
    const scope = getCompanionReadingScope();
    if (current.current?.key === key && current.current.scope === scope) return current.current.promise;
    if (displayed.current?.nodeId !== nodeId || displayed.current.scope !== scope ||
      displayed.current.libraryScope !== snapshot?.libraryScope) release();
    const request: Request = { key, nodeId, scope, promise: Promise.resolve(null) };
    current.current = request;
    const isCurrent = () => mounted.current && current.current === request &&
      scope === getCompanionReadingScope() && key === companionReadingDemandKey(latestSnapshot.current, nodeId);
    request.promise = Promise.resolve().then(() => isCurrent()
      ? loadCompanionReadableArticle(snapshot, nodeId, isCurrent) : null
    ).then((article) => {
      if (!isCurrent()) return null;
      request.article = article;
      displayed.current = article ? { article, libraryScope: snapshot?.libraryScope, nodeId, scope } : null;
      setReadableArticle(article);
      return article;
    }).catch(async (error: unknown) => {
      if (!isCurrent()) return null;
      current.current = null;
      if (error instanceof CompanionReadingSnapshotChanged && onSnapshotChanged && refreshedKey.current !== key) {
        refreshedKey.current = key;
        await onSnapshotChanged();
        return null;
      }
      onError?.(error instanceof Error ? error.message : String(error));
      throw error;
    });
    return request.promise;
  }, [onError, onSnapshotChanged, release, setReadableArticle, snapshot]);
  const visible = displayed.current;
  const readableArticle = visible?.scope === getCompanionReadingScope() &&
    visible.libraryScope === snapshot?.libraryScope &&
    companionReadingDemandKey(snapshot, visible.nodeId) ? visible.article : null;
  return { openReadableArticle, readableArticle };
}
