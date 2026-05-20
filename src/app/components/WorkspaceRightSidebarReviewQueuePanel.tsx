import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import { AppErrorState } from '../../shared/ui';

interface WorkspaceRightSidebarReviewQueuePanelProps {
  currentNodeId: string | null;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  queueNodeIds: string[];
}

function buildDisplayQueueNodeIds(queueNodeIds: string[], currentNodeId: string | null) {
  const currentIndex = currentNodeId ? queueNodeIds.indexOf(currentNodeId) : -1;
  if (currentIndex <= 0) {
    return queueNodeIds;
  }
  return [...queueNodeIds.slice(currentIndex), ...queueNodeIds.slice(0, currentIndex)];
}

function getQueueItemTitle(node: Node | undefined) {
  if (!node) {
    return 'Missing topic';
  }
  const title = node.title.trim();
  if (title.length > 0) {
    return title;
  }
  return 'Untitled topic';
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getQueueItemTimeLabel(node: Node | undefined) {
  if (!node) {
    return 'Unknown';
  }
  if (isFsrsReviewItemNode(node)) {
    return formatShortDateTime(node.review?.due);
  }
  return formatShortDateTime(node.reading?.nextAt ?? node.createdAt);
}

function QueueHeader({ fsrsCount, readingCount }: { fsrsCount: number; readingCount: number }) {
  return (
    <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
      <h2 className="m-0 text-[13px] font-medium uppercase tracking-[0.02em] text-foreground/55">Review</h2>
      <p className="whitespace-nowrap text-[12px] text-foreground/45">
        <span>{fsrsCount}</span> items · <span>{readingCount}</span> topics
      </p>
    </header>
  );
}

function EmptyQueueState() {
  return (
    <section className="min-h-0">
      <QueueHeader fsrsCount={0} readingCount={0} />
      <p className="px-4 py-3 text-[13px] text-foreground/55">No review entries are available right now.</p>
    </section>
  );
}

function QueueKindIcon({ kind }: { kind: 'item' | 'topic' }) {
  if (kind === 'item') {
    return (
      <svg aria-hidden="true" className="size-4 text-foreground/35" fill="none" focusable="false" viewBox="0 0 16 16">
        <polygon points="8,2.8 13.2,8 8,13.2 2.8,8" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="size-4 text-foreground/35" fill="none" focusable="false" viewBox="0 0 16 16">
      <polygon points="8,2.2 13.1,5.1 13.1,10.9 8,13.8 2.9,10.9 2.9,5.1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function WorkspaceRightSidebarReviewQueuePanel(props: WorkspaceRightSidebarReviewQueuePanelProps) {
  if (props.queueNodeIds.length === 0) {
    return <EmptyQueueState />;
  }

  const missingQueueNodeId = props.queueNodeIds.find((nodeId) => !props.nodesById[nodeId]);
  if (missingQueueNodeId) {
    return (
      <AppErrorState
        description="Refresh the workspace before continuing review."
        title="Review queue has an unavailable topic"
      />
    );
  }

  const displayQueueNodeIds = buildDisplayQueueNodeIds(props.queueNodeIds, props.currentNodeId);
  const fsrsCount = props.queueNodeIds.filter((nodeId) => isFsrsReviewItemNode(props.nodesById[nodeId])).length;
  const readingCount = props.queueNodeIds.length - fsrsCount;

  return (
    <section className="flex min-h-0 flex-col">
      <QueueHeader fsrsCount={fsrsCount} readingCount={readingCount} />
      <ol aria-label="Review queue items" className="min-h-0 flex-1 overflow-y-auto py-1">
        {displayQueueNodeIds.map((nodeId, index) => {
          const node = props.nodesById[nodeId];
          const kind = isFsrsReviewItemNode(node) ? 'item' : 'topic';

          return (
            <li key={nodeId} className="grid min-h-10 grid-cols-[2ch_1rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-1.5 hover:bg-foreground/[0.025]">
              <span className="text-right text-[11px] tabular-nums text-foreground/28">{index + 1}</span>
              <QueueKindIcon kind={kind} />
              <button
                className="min-w-0 truncate text-left text-[13.5px] font-normal text-foreground/82 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/35"
                onClick={() => props.onSelectNode(nodeId)}
                type="button"
              >
                {getQueueItemTitle(node)}
              </button>
              <span className="whitespace-nowrap text-[11.5px] tabular-nums text-foreground/35">{getQueueItemTimeLabel(node)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
