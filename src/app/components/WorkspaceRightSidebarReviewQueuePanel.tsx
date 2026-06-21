import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import {
  AppErrorState,
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { getDemoDayHeading } from './workspaceRightSidebarReviewQueueDays';
import { buildDisplayQueueNodeIds, FlowSection } from './WorkspaceRightSidebarReviewQueueSections';

interface WorkspaceRightSidebarReviewQueuePanelProps {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
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
    </section>
  );
}

function collectFlowNodeIds(flowWindow: ReviewFlowWindow) {
  return [...flowWindow.queueNodeIds, ...flowWindow.readyNodeIds, ...flowWindow.upcomingNodeIds];
}

function collectDemoFlowNodeIds(flowWindow: ReviewFlowWindow) {
  return [
    ...flowWindow.queueNodeIds,
    ...flowWindow.readyNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ];
}

function renderDemoDaySections(args: {
  flowWindow: ReviewFlowWindow;
  indexOffset: number;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  t: Translate;
}) {
  let indexOffset = args.indexOffset;
  return args.flowWindow.dayBuckets.map((bucket) => {
    const section = (
      <FlowSection
        heading={getDemoDayHeading(bucket.dayOffset, args.t)}
        indexOffset={indexOffset}
        key={bucket.dayOffset}
        nodeIds={bucket.nodeIds}
        nodesById={args.nodesById}
        onSelectNode={args.onSelectNode}
        showDivider={indexOffset > 0}
      />
    );
    indexOffset += bucket.nodeIds.length;
    return section;
  });
}

function renderDemoCurrentDaySection(args: {
  currentNodeIds: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  t: Translate;
}) {
  return (
    <FlowSection
      heading={getDemoDayHeading(0, args.t)}
      indexOffset={0}
      nodeIds={args.currentNodeIds}
      nodesById={args.nodesById}
      onSelectNode={args.onSelectNode}
      showDivider={false}
    />
  );
}

function renderScheduledLaterSection(args: {
  flowWindow: ReviewFlowWindow;
  indexOffset: number;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  showDivider: boolean;
  t: Translate;
}) {
  return (
    <FlowSection
      heading={args.t('desktop.rightPanel.flow.scheduledLater')}
      indexOffset={args.indexOffset}
      nodeIds={args.flowWindow.upcomingNodeIds}
      nodesById={args.nodesById}
      onSelectNode={args.onSelectNode}
      showDivider={args.showDivider}
    />
  );
}

function FlowPanelContent(props: WorkspaceRightSidebarReviewQueuePanelProps & {
  isDemo: boolean;
  t: Translate;
}) {
  const displayQueueNodeIds = buildDisplayQueueNodeIds(props.flowWindow.queueNodeIds, props.currentNodeId);
  const currentDemoNodeIds = [...displayQueueNodeIds, ...props.flowWindow.readyNodeIds];
  const readyIndexOffset = displayQueueNodeIds.length;
  const futureIndexOffset = props.isDemo ? currentDemoNodeIds.length : readyIndexOffset + props.flowWindow.readyNodeIds.length;
  return (
    <ol aria-label={props.t('desktop.rightPanel.flow.items')} className="min-h-0 flex-1 overflow-y-auto py-1">
      {props.isDemo
        ? renderDemoSections({ ...props, currentDemoNodeIds, futureIndexOffset })
        : renderStandardSections({ ...props, displayQueueNodeIds, futureIndexOffset, readyIndexOffset })}
    </ol>
  );
}

function renderDemoSections(args: WorkspaceRightSidebarReviewQueuePanelProps & {
  currentDemoNodeIds: string[];
  futureIndexOffset: number;
  t: Translate;
}) {
  return (
    <>
      {renderDemoCurrentDaySection({
        currentNodeIds: args.currentDemoNodeIds,
        nodesById: args.nodesById,
        onSelectNode: args.onSelectNode,
        t: args.t
      })}
      {renderDemoDaySections({
        flowWindow: args.flowWindow,
        indexOffset: args.futureIndexOffset,
        nodesById: args.nodesById,
        onSelectNode: args.onSelectNode,
        t: args.t
      })}
    </>
  );
}

function renderStandardSections(args: WorkspaceRightSidebarReviewQueuePanelProps & {
  displayQueueNodeIds: string[];
  futureIndexOffset: number;
  readyIndexOffset: number;
  t: Translate;
}) {
  return (
    <>
      <FlowSection
        indexOffset={0}
        nodeIds={args.displayQueueNodeIds}
        nodesById={args.nodesById}
        onSelectNode={args.onSelectNode}
        showDivider={false}
      />
      <FlowSection
        indexOffset={args.readyIndexOffset}
        nodeIds={args.flowWindow.readyNodeIds}
        nodesById={args.nodesById}
        onSelectNode={args.onSelectNode}
        showDivider={args.displayQueueNodeIds.length > 0}
      />
      {renderScheduledLaterSection({
        flowWindow: args.flowWindow,
        indexOffset: args.futureIndexOffset,
        nodesById: args.nodesById,
        onSelectNode: args.onSelectNode,
        showDivider: args.displayQueueNodeIds.length > 0 || args.flowWindow.readyNodeIds.length > 0,
        t: args.t
      })}
    </>
  );
}

export function WorkspaceRightSidebarReviewQueuePanel(props: WorkspaceRightSidebarReviewQueuePanelProps) {
  const t = useTranslation();
  const { isDemo } = useDemoRuntimeState();
  const flowNodeIds = isDemo ? collectDemoFlowNodeIds(props.flowWindow) : collectFlowNodeIds(props.flowWindow);
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

  return (
    <section className="flex min-h-0 flex-col">
      <QueueHeader />
      <FlowPanelContent {...props} isDemo={isDemo} t={t} />
    </section>
  );
}
