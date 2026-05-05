import { CompanionArticleDocument } from './CompanionArticleDocument';
import { BottomFloatingBar, TopFloatingBar } from './CompanionFloatingBars';
import { RecentArticleList } from './CompanionRecentArticleList';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

export function CompanionShell() {
  const floatingBar = useFloatingBarVisibility('companion-top-bar');
  const workspaceSync = useCompanionWorkspaceSync();
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar);

  return (
    <>
      <main className="h-dvh bg-canvas text-foreground">
        <div
          className="h-dvh overflow-y-auto"
          onScroll={floatingBar.handleContainerScroll}
          onTouchEnd={floatingBar.handleTouchEnd}
          onTouchMove={floatingBar.handleTouchMove}
          onTouchStart={floatingBar.handleTouchStart}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 pb-24 pt-4 sm:px-6">
            <TopFloatingBar activeAction={surface.activeAction} onAction={surface.handleTopBarAction} visible={floatingBar.isVisible} />
            {surface.activeAction === 'recent' ? (
              <RecentArticleList
                currentArticleId={surface.readableArticle?.nodeId ?? null}
                onSelectArticle={surface.handleSelectRecentArticle}
                recentArticles={surface.recentArticles}
              />
            ) : surface.readableArticle ? (
              <CompanionArticleDocument
                content={surface.readableArticle.content}
                nodeId={surface.readableArticle.nodeId}
              />
            ) : (
              <section className="rounded-3xl border border-dashed border-border bg-bg-panel px-5 py-8 text-sm leading-6 text-accent">
                <p>
                  No article has been synced to this device yet.
                </p>
                <p className="mt-3">
                  Keep the desktop client available on the same machine or network. The companion will refresh this reading surface when a newer snapshot is found.
                </p>
                {workspaceSync.error ? <span className="mt-4 block text-red-700">{workspaceSync.error}</span> : null}
              </section>
            )}
          </div>
        </div>
      </main>
      <BottomFloatingBar visible={false} />
    </>
  );
}
