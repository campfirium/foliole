import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import { AppErrorState, InspectorSection } from '../../shared/ui';

interface WorkspaceRightSidebarReviewQueuePanelProps {
  currentNodeId: string | null;
  nodesById: Record<string, Node>;
  queueNodeIds: string[];
}

function buildDisplayQueueNodeIds(queueNodeIds: string[], currentNodeId: string | null) {
  if (!currentNodeId || !queueNodeIds.includes(currentNodeId)) {
    return queueNodeIds;
  }
  return [currentNodeId, ...queueNodeIds.filter((nodeId) => nodeId !== currentNodeId)];
}

function getQueueItemKindLabel(node: Node | undefined) {
  return isFsrsReviewItemNode(node) ? 'Review item' : 'Reading';
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

function getQueueItemScheduleLabel(node: Node | undefined) {
  if (!node) {
    return 'Missing schedule';
  }
  if (isFsrsReviewItemNode(node)) {
    const due = node.review?.due;
    if (!due) {
      return 'Review · Unscheduled';
    }
    const isDue = Date.parse(due) <= Date.now();
    return `${isDue ? 'Due' : 'Scheduled'} · ${formatShortDateTime(due)}`;
  }
  return `Next · ${formatShortDateTime(node.reading?.nextAt ?? node.createdAt)}`;
}

function QueueSummary({ fsrsCount, readingCount, totalCount }: { fsrsCount: number; readingCount: number; totalCount: number }) {
  return (
    <InspectorSection title="Whole queue">
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-[var(--app-inspector-section-elevated-bg)] px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Total</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{totalCount}</dd>
        </div>
        <div className="rounded-md bg-[var(--app-inspector-section-elevated-bg)] px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Review items</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{fsrsCount}</dd>
        </div>
        <div className="rounded-md bg-[var(--app-inspector-section-elevated-bg)] px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Reading</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{readingCount}</dd>
        </div>
      </dl>
    </InspectorSection>
  );
}

function EmptyQueueState() {
  return (
    <InspectorSection description="No scheduled review items are available right now." title="Review queue" />
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
    <div className="flex min-h-0 flex-col gap-3">
      <QueueSummary fsrsCount={fsrsCount} readingCount={readingCount} totalCount={props.queueNodeIds.length} />
      <InspectorSection className="p-2" title="Review queue">
        <ol aria-label="Review queue items" className="flex flex-col gap-1">
          {displayQueueNodeIds.map((nodeId, index) => {
            const node = props.nodesById[nodeId];
            const isCurrent = nodeId === props.currentNodeId;

            return (
              <li
                key={nodeId}
                className="rounded-md border border-transparent px-2 py-2 data-[current=true]:border-border data-[current=true]:bg-foreground/[0.04]"
                data-current={isCurrent}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{index + 1}. {getQueueItemTitle(node)}</p>
                    <p className="mt-1 text-[12px] text-foreground/60">{getQueueItemKindLabel(node)} queue</p>
                    <p className="mt-1 text-[12px] text-foreground/45">{getQueueItemScheduleLabel(node)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                    {isCurrent ? 'Current' : 'Queued'}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </InspectorSection>
    </div>
  );
}
