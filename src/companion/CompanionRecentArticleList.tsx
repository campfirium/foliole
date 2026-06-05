import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { AppEmptyState, NodeBrowseList } from '../shared/ui';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  onSelectArticle(nodeId: string): void;
  recentArticles: CompanionRecentArticle[];
}) {
  const t = useTranslation();
  if (props.recentArticles.length === 0) {
    return (
      <section className="border-t border-companion-divider px-1 py-6">
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.recent.empty.description')}
          title={t('companion.recent.empty.title')}
        />
      </section>
    );
  }

  return (
    <NodeBrowseList
      currentNodeId={props.currentArticleId}
      emptyLabel={t('companion.recent.empty.title')}
      items={props.recentArticles}
      onSelectNode={props.onSelectArticle}
    />
  );
}
