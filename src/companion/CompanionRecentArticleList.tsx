import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { NodeBrowseList } from '../shared/ui';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  return (
    <NodeBrowseList
      currentNodeId={props.currentArticleId}
      emptyLabel="No recent articles have been synced to this device yet."
      items={props.recentArticles}
      onSelectNode={props.onSelectArticle}
    />
  );
}
