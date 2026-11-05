import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import { CompanionArticleTransition } from './CompanionArticleTransition';
import { CompanionListViewportProvider } from './CompanionListViewport';
import type { CompanionShellModel } from './CompanionShell';

export type CompanionListPageKey = 'recent' | 'directory' | 'search';
const PageActive = createContext(true);
export const useCompanionPageActive = () => useContext(PageActive);
type SavedPage = { content: ReactNode; sortIdentity: string };
type Pages = Partial<Record<CompanionListPageKey, SavedPage>>;

function ScrollPage(props: {
  active: boolean; covered?: boolean; children: ReactNode; model: CompanionShellModel; pageKey: string; sortIdentity: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { model, active } = props;
  return <div
    aria-hidden={active ? undefined : true}
    className="absolute inset-0 overflow-y-auto"
    data-companion-page={props.pageKey}
    data-testid={active ? 'companion-scroll-container' : undefined}
    inert={active ? undefined : true}
    onClick={active ? model.handleContentTap : undefined}
    onScroll={active ? model.handleContainerScroll : undefined}
    onTouchEnd={active ? model.floatingBar.handleTouchEnd : undefined}
    onTouchMove={active ? model.floatingBar.handleTouchMove : undefined}
    onTouchStart={active ? model.floatingBar.handleTouchStart : undefined}
    ref={scrollRef}
    style={{ visibility: active || props.covered ? 'visible' : 'hidden' }}
  >
    <PageActive.Provider value={active}><CompanionListViewportProvider scrollRef={scrollRef}
      sortIdentity={props.sortIdentity}>
      {props.children}
    </CompanionListViewportProvider></PageActive.Provider>
  </div>;
}

/** Only visited list destinations survive navigation; readers are always released. */
export function CompanionPageStack(props: {
  content: ReactNode; pageKey: CompanionListPageKey | null; reading: boolean; model: CompanionShellModel;
}) {
  const [pages, setPages] = useState<Pages>({});
  const [moving, setMoving] = useState(false);
  const { pageKey, reading, content, model } = props;
  if (pageKey && !reading && pages[pageKey]?.content !== content) {
    setPages({ ...pages, [pageKey]: { content, sortIdentity: `${model.browseSortKey}:${model.browseSortDirection}` } });
  }
  return <>
    {Object.entries(pages).map(([key, page]) => <ScrollPage key={key} pageKey={key}
      covered={moving && reading && key === pageKey}
      active={key === pageKey && !reading} model={model} sortIdentity={page!.sortIdentity}>{page!.content}</ScrollPage>)}
    {!pageKey && !reading ? <ScrollPage key={model.surface.activeAction === 'more' ? model.settingsPage : 'other'}
      pageKey="other" active model={model} sortIdentity="">{content}</ScrollPage> : null}
    {reading ? pageKey ? <CompanionArticleTransition onMotionChange={setMoving}>
      {content}
    </CompanionArticleTransition> : content : null}
  </>;
}
