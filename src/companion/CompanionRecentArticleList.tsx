import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { NodeBrowseList } from '../shared/ui';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  if (props.recentArticles.length === 0) {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>No recent topics have been synced to this device yet.</p>
        <p className="mt-3">Connect this device with desktop, then reopen the app to sync automatically.</p>
      </section>
    );
  }

  return (
    <NodeBrowseList
      currentNodeId={props.currentArticleId}
      emptyLabel="No recent topics have been synced to this device yet."
      items={props.recentArticles}
      onSelectNode={props.onSelectArticle}
    />
  );
}
