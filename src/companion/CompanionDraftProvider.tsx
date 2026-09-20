import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { subscribeNativeAppBackground, subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';

type Drafts = Map<string, ContentDraftSession>;
const DraftContext = createContext<Drafts | null>(null);

export function useCompanionDrafts() {
  const shared = useContext(DraftContext);
  const [local] = useState<Drafts>(() => new Map());
  return shared ?? local;
}

export function CompanionDraftProvider({ children }: { children: ReactNode }) {
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
  return <DraftContext.Provider value={drafts}>{children}</DraftContext.Provider>;
}
