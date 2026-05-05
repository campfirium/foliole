import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';
import { NodeBrowseList } from '../shared/ui';

export function RecentArticleList(props: {
  currentArticleId: string | null;
  endpointUrl?: string | null;
  onSelectArticle(nodeId: string): void;
  onSyncNow?: (endpointUrl: string) => void;
  recentArticles: CompanionRecentArticle[];
  status?: 'idle' | 'loading' | 'syncing';
}) {
  if (props.recentArticles.length === 0) {
    const canSync = Boolean(props.endpointUrl && props.onSyncNow);
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        <p>No recent topics have been synced to this device yet.</p>
        {canSync ? (
          <button
            className="mt-4 rounded-full border border-border bg-bg-subtle px-4 py-2 text-sm font-medium text-foreground transition hover:bg-canvas"
            disabled={props.status === 'syncing'}
            onClick={() => props.endpointUrl ? props.onSyncNow?.(props.endpointUrl) : undefined}
            type="button"
          >
            {props.status === 'syncing' ? 'Syncing' : 'Sync now'}
          </button>
        ) : (
          <p className="mt-3">Open Device sync to connect this device with desktop.</p>
        )}
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
