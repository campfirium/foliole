import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { subscribeNativeAppBackground, subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';
import { HighlightDraftStore } from '../shared/platform/companion/editing/highlightDraftSession';

type Drafts = Map<string, ContentDraftSession>;
const HighlightDraftContext = createContext<HighlightDraftStore | null>(null);

export function useCompanionHighlightDrafts() {
  const shared = useContext(HighlightDraftContext);
  const [local] = useState(() => new HighlightDraftStore());
  return shared ?? local;
}

const DraftContext = createContext<Drafts | null>(null);

export function useCompanionDrafts() {
  const shared = useContext(DraftContext);
  const [local] = useState<Drafts>(() => new Map());
  return shared ?? local;
}

export function CompanionDraftProvider({ children }: { children: ReactNode }) {
  const [highlightDrafts] = useState(() => new HighlightDraftStore());
  const [drafts] = useState<Drafts>(() => new Map());
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const flush = () => {
      for (const session of drafts.values()) {
        void session.flush().then(() => {
          if (!session.dirty && !session.attached) drafts.delete(session.nodeId);
        }).catch(() => undefined);
      }
    };
    for (const subscribe of [subscribeNativeAppBackground, subscribeNativeAppForeground]) {
      void subscribe(flush).then((cleanup) => {
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      });
    }
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      flush();
    };
  }, [drafts]);
  return <DraftContext.Provider value={drafts}>
    <HighlightDraftContext.Provider value={highlightDrafts}>{children}</HighlightDraftContext.Provider>
  </DraftContext.Provider>;
}
