import { useEffect, useRef, useState } from 'react';

import { HighlightDraftSession } from '../shared/platform/companion/editing/highlightDraftSession';
import type { CompanionHighlightRead } from '../shared/platform/companion/reading/companionHighlightRead';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { useCompanionHighlightDrafts } from './CompanionDraftProvider';
import type { CompanionExistingHighlightTarget } from './companionExistingHighlightActions';
import { CompanionSelectionRefreshError } from './companionSelectionRefreshError';

type HighlightLoader = ((nodeId: string) => Promise<CompanionHighlightRead>) | undefined;

function useHighlightReadSession(target: CompanionExistingHighlightTarget | undefined, load: HighlightLoader) {
  const store = useCompanionHighlightDrafts();
  const scope = useRef(getCompanionReadingScope());
  const [session] = useState(() => target ? store.acquire(scope.current, target.nodeId) : new HighlightDraftSession(() => {}));
  const [loading, setLoading] = useState(Boolean(target && load && !session.data));
  const [error, setError] = useState(false);
  const [, redraw] = useState(0);
  const lifetime = useRef({ mounted: true, request: 0, pending: false, submitting: false });
  const latest = useRef({ target, load });
  latest.current = { target, load };
  const isCurrent = () => lifetime.current.mounted && scope.current === getCompanionReadingScope();
  function retry() {
    const { target: current, load: read } = latest.current;
    if (!isCurrent() || !current || !read || lifetime.current.pending || session.dirty || session.pending) return;
    const request = ++lifetime.current.request;
    lifetime.current.pending = true;
    setLoading(true); setError(false);
    void readHighlight({ read, nodeId: current.nodeId, session,
      valid: () => isCurrent() && request === lifetime.current.request,
      failed: () => setError(true), finished: () => { lifetime.current.pending = false; setLoading(false); } });
  }
  useEffect(() => {
    lifetime.current.mounted = true;
    const unsubscribe = session.subscribe(() => redraw((value) => value + 1));
    const stopScope = subscribeCompanionReadingScope(() => { lifetime.current.request++; setLoading(false); setError(true); });
    return () => { lifetime.current.mounted = false; lifetime.current.request++; lifetime.current.pending = false; unsubscribe(); stopScope(); };
  }, [session]);
  useEffect(() => {
    if (!session.data && !session.pending && !session.error && !lifetime.current.submitting) retry();
  // A session keeps its original read guard and edited note across callback or snapshot changes.
  }, [session.data, session.pending]);
  return { session, loading, error, isCurrent, lifetime, scope: scope.current,
    canRetry: scope.current === getCompanionReadingScope(), retry, fallbackNote: target?.note ?? '', hasLoader: Boolean(load) };
}

async function readHighlight(args: {
  read: NonNullable<HighlightLoader>; nodeId: string; session: HighlightDraftSession;
  valid(): boolean; failed(): void; finished(): void;
}) {
  try {
    await Promise.resolve();
    if (!args.valid()) return;
    const result = await args.read(args.nodeId);
    if (args.valid()) args.session.loaded(result);
  } catch {
    if (args.valid()) args.failed();
  } finally {
    if (args.valid()) args.finished();
  }
}

function useHighlightSaveSession(read: ReturnType<typeof useHighlightReadSession>, ready: boolean) {
  function save(action: () => Promise<void> | void, close: () => void) {
    if (!read.isCurrent() || !ready || read.loading || read.session.pending) return;
    const request = read.lifetime.current.request;
    read.lifetime.current.submitting = true;
    // Once submitted, the owner retains this write even when the toolbar detaches.
    void read.session.write(() => {
      if (read.scope !== getCompanionReadingScope()) throw new Error('companion_highlight_session_changed');
      if (read.session.refresh) return read.session.refresh().then(() => undefined);
      return Promise.resolve().then(action).catch((error) => {
        if (error instanceof CompanionSelectionRefreshError) read.session.refresh = error.retryRefresh;
        throw error;
      });
    }).then(() => {
      if (read.isCurrent() && request === read.lifetime.current.request) close();
    }).catch(() => { read.lifetime.current.submitting = false; });
  }
  return { save, saving: Boolean(read.session.pending) };
}

export function useCompanionHighlightSession(target: CompanionExistingHighlightTarget | undefined, load: HighlightLoader) {
  const read = useHighlightReadSession(target, load);
  const ready = read.canRetry && (!load || Boolean(read.session.data));
  const write = useHighlightSaveSession(read, ready);
  return { saved: Boolean(read.session.refresh), canRetry: read.canRetry, draft: read.session.data || read.session.dirty ? read.session.value : read.fallbackNote,
    setDraft: (value: string) => read.session.change(value), guard: read.session.data?.guard,
    loading: read.loading, error: read.error || read.session.error, ready, retry: read.retry, ...write };
}
