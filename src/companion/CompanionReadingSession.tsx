// T886: the reading session sits above the reading entries, so what a reader has asked of the screen
// outlives article remounts, loading bodies and the shell switching between its reader branches.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode, type SetStateAction } from 'react';

import { useCompanionReadingSystemBars } from './useCompanionReadingSystemBars';

interface ArticleView { chromeVisible: boolean; editing: boolean; outlineOpen: boolean }

const closedView: ArticleView & { owner: object | null } = {
  owner: null, chromeVisible: false, editing: false, outlineOpen: false
};

interface ReadingSession {
  view: typeof closedView;
  setView(update: SetStateAction<typeof closedView>): void;
  join(): () => void;
}

const ReadingSessionContext = createContext<ReadingSession | null>(null);

function useReadingSession() {
  const session = useContext(ReadingSessionContext);
  if (!session) throw new Error('A reading session is required');
  return session;
}

/** Holds the session. Reading lasts while at least one reading entry is mounted below it. */
export function CompanionReadingSessionHost(props: { children: ReactNode }) {
  const [readers, setReaders] = useState(0);
  const [view, setView] = useState(closedView);
  // Editing keeps the bars held, so the keyboard is the only thing that resizes the window then.
  useCompanionReadingSystemBars(readers > 0, view.outlineOpen);
  const join = useCallback(() => {
    setReaders(count => count + 1);
    return () => setReaders(count => count - 1);
  }, []);
  const session = useMemo(() => ({ join, setView, view }), [join, view]);
  return <ReadingSessionContext.Provider value={session}>{props.children}</ReadingSessionContext.Provider>;
}

function Reader(props: { children: ReactNode }) {
  const { join } = useReadingSession();
  useLayoutEffect(join, [join]);
  return <>{props.children}</>;
}

/** Marks a reading entry, including its loading states. Without a host above it, it brings its own. */
export function CompanionReadingSession(props: { children: ReactNode }) {
  const host = useContext(ReadingSessionContext);
  const reader = <Reader>{props.children}</Reader>;
  return host ? reader : <CompanionReadingSessionHost>{reader}</CompanionReadingSessionHost>;
}

const apply = <T,>(update: SetStateAction<T>, value: T) =>
  typeof update === 'function' ? (update as (previous: T) => T)(value) : update;

/** One article's toolbars and modes. Every newly mounted article starts with all of them closed. */
export function useCompanionReadingArticleView() {
  const { setView, view } = useReadingSession();
  const [owner] = useState(() => ({}));
  const set = useCallback((key: keyof ArticleView, update: SetStateAction<boolean>) => {
    setView(previous => {
      const base = previous.owner === owner ? previous : closedView;
      return { ...base, owner, [key]: apply(update, base[key]) };
    });
  }, [owner, setView]);
  useLayoutEffect(() => () => setView(previous => previous.owner === owner ? closedView : previous), [owner, setView]);
  const setters = useMemo(() => ({
    setChromeVisible: (update: SetStateAction<boolean>) => set('chromeVisible', update),
    setEditing: (update: SetStateAction<boolean>) => set('editing', update),
    setOutlineOpen: (update: SetStateAction<boolean>) => set('outlineOpen', update)
  }), [set]);
  return { ...(view.owner === owner ? view : closedView), ...setters };
}
