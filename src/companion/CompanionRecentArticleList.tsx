import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  if (props.recentArticles.length === 0) {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        No recent articles have been synced to this device yet.
      </section>
    );
  }

  return (
    <section className="border-t border-companion-divider">
      {props.recentArticles.map((article) => (
        <button
          key={article.nodeId}
          className={`block w-full border-b px-1 py-4 text-left transition-colors ${
            article.nodeId === props.currentArticleId
              ? 'border-companion-divider bg-companion-subtle'
              : 'border-companion-divider bg-transparent hover:bg-companion-subtle/60'
          }`}
          onClick={() => props.onSelectArticle(article.nodeId)}
          type="button"
        >
          <h2 className="text-[18px] font-semibold leading-7 text-foreground">{article.title}</h2>
          {article.preview ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-companion-text-secondary">{article.preview}</p> : null}
        </button>
      ))}
    </section>
  );
}
