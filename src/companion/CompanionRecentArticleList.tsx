import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';

function formatRecentArticleTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  }).format(date);
}

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  if (props.recentArticles.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-border bg-bg-panel px-5 py-8 text-sm leading-6 text-accent">
        No recent articles have been synced to this device yet.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {props.recentArticles.map((article) => (
        <button
          key={article.nodeId}
          className={`block w-full rounded-3xl border px-4 py-4 text-left transition-colors ${
            article.nodeId === props.currentArticleId ? 'border-foreground/20 bg-bg-subtle' : 'border-border bg-canvas'
          }`}
          onClick={() => props.onSelectArticle(article.nodeId)}
          type="button"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-medium leading-6 text-foreground">{article.title}</h2>
            <span className="shrink-0 text-xs text-accent">{formatRecentArticleTime(article.updatedAt)}</span>
          </div>
          {article.preview ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground/72">{article.preview}</p> : null}
        </button>
      ))}
    </section>
  );
}
