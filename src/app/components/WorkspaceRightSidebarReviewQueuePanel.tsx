import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  AppErrorState,
  inspectorListDividerLineClassName,
  inspectorListHeadingClassName,
  inspectorListInsetClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName,
  inspectorListTitleClassName
} from '../../shared/ui';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { WorkspaceRightSidebarReviewQueueDemoControls } from './WorkspaceRightSidebarReviewQueueDemoControls';

interface WorkspaceRightSidebarReviewQueuePanelProps {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function buildDisplayQueueNodeIds(queueNodeIds: string[], currentNodeId: string | null) {
  const currentIndex = currentNodeId ? queueNodeIds.indexOf(currentNodeId) : -1;
  if (currentIndex <= 0) {
    return queueNodeIds;
  }
  return [...queueNodeIds.slice(currentIndex), ...queueNodeIds.slice(0, currentIndex)];
}

function getQueueItemTitle(node: Node | undefined, t: Translate) {
  if (!node) {
    return t('desktop.rightPanel.flow.missingTopic');
  }
  const title = node.title.trim();
  if (title.length > 0) {
    return title;
  }
  return t('desktop.rightPanel.flow.untitledTopic');
}

function QueueHeader() {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} pb-2 pt-3`}>
      <h2 className={`m-0 px-0 pb-0 ${inspectorListHeadingClassName}`}>{t('desktop.rightPanel.flow')}</h2>
    </header>
  );
}

function EmptyQueueState() {
  const t = useTranslation();
  return (
    <section className="min-h-0">
      <QueueHeader />
      <p className={`${inspectorListInsetPaddingClassName} py-3 ${inspectorListMetaClassName}`}>{t('desktop.rightPanel.flow.empty')}</p>
      <WorkspaceRightSidebarReviewQueueDemoControls hasUpcoming={false} />
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

function QueueRow(props: {
  index: number;
  node: Node;
  nodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const kind = isFsrsReviewItemNode(props.node) ? 'item' : 'topic';
  return (
    <li className={`grid min-h-10 grid-cols-[2ch_1rem_minmax(0,1fr)] items-center gap-2 py-1.5 hover:bg-[var(--app-inspector-list-row-hover-bg)] ${inspectorListInsetPaddingClassName}`}>
      <span className={`${inspectorListMetaClassName} text-right tabular-nums text-foreground/28`}>{props.index + 1}</span>
      <QueueKindIcon kind={kind} />
      <button
        className={`${inspectorListTitleClassName} truncate font-normal text-foreground/82 underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
        onClick={() => props.onSelectNode(props.nodeId)}
        type="button"
      >
        {getQueueItemTitle(props.node, t)}
      </button>
    </li>
  );
}

function FlowSection(props: {
  heading?: string;
  indexOffset: number;
  nodeIds: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  showDivider: boolean;
}) {
  if (props.nodeIds.length === 0) {
    return null;
  }
  return (
    <>
      {props.showDivider ? <li className={`${inspectorListInsetClassName} my-1.5 h-px list-none ${inspectorListDividerLineClassName}`} role="presentation" /> : null}
      {props.heading ? (
        <li className={`${inspectorListInsetPaddingClassName} list-none pb-1 pt-2 ${inspectorListMetaClassName}`}>
          {props.heading}
        </li>
      ) : null}
      {props.nodeIds.map((nodeId, index) => (
        <QueueRow
          index={props.indexOffset + index}
          key={nodeId}
          node={props.nodesById[nodeId]!}
          nodeId={nodeId}
          onSelectNode={props.onSelectNode}
        />
      ))}
    </>
  );
}

function collectFlowNodeIds(flowWindow: ReviewFlowWindow) {
  return [...flowWindow.queueNodeIds, ...flowWindow.readyNodeIds, ...flowWindow.upcomingNodeIds];
}

export function WorkspaceRightSidebarReviewQueuePanel(props: WorkspaceRightSidebarReviewQueuePanelProps) {
  const t = useTranslation();
  const flowNodeIds = collectFlowNodeIds(props.flowWindow);
  if (flowNodeIds.length === 0) {
    return <EmptyQueueState />;
  }

  const missingQueueNodeId = flowNodeIds.find((nodeId) => !props.nodesById[nodeId]);
  if (missingQueueNodeId) {
    return (
      <AppErrorState
        description={t('desktop.rightPanel.flow.unavailableDescription')}
        title={t('desktop.rightPanel.flow.unavailableTitle')}
      />
    );
  }

  const displayQueueNodeIds = buildDisplayQueueNodeIds(props.flowWindow.queueNodeIds, props.currentNodeId);
  const readyIndexOffset = displayQueueNodeIds.length;
  const upcomingIndexOffset = readyIndexOffset + props.flowWindow.readyNodeIds.length;
  const hasUpcoming = props.flowWindow.upcomingNodeIds.length > 0;

  return (
    <section className="flex min-h-0 flex-col">
      <QueueHeader />
      <ol aria-label={t('desktop.rightPanel.flow.items')} className="min-h-0 flex-1 overflow-y-auto py-1">
        <FlowSection
          indexOffset={0}
          nodeIds={displayQueueNodeIds}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          showDivider={false}
        />
        <FlowSection
          indexOffset={readyIndexOffset}
          nodeIds={props.flowWindow.readyNodeIds}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          showDivider={displayQueueNodeIds.length > 0}
        />
        <FlowSection
          heading={t('desktop.rightPanel.flow.scheduledLater')}
          indexOffset={upcomingIndexOffset}
          nodeIds={props.flowWindow.upcomingNodeIds}
          nodesById={props.nodesById}
          onSelectNode={props.onSelectNode}
          showDivider={displayQueueNodeIds.length > 0 || props.flowWindow.readyNodeIds.length > 0}
        />
      </ol>
      <WorkspaceRightSidebarReviewQueueDemoControls hasUpcoming={hasUpcoming} />
    </section>
  );
}
