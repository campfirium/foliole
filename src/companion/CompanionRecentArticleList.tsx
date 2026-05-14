import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { AppEmptyState, NodeBrowseList } from '../shared/ui';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  if (props.recentArticles.length === 0) {
    return (
      <section className="border-t border-companion-divider px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description="Recent topics will appear here after background sync downloads them."
          title="No recent topics are available on this device yet."
        />
      </section>
    );
  }

  return (
    <NodeBrowseList
      currentNodeId={props.currentArticleId}
      emptyLabel="No recent topics are available on this device yet."
      items={props.recentArticles}
      onSelectNode={props.onSelectArticle}
    />
  );
}
