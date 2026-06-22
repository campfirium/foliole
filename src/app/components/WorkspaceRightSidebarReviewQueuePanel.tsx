import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import {
  inspectorListHeadingClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName
} from '../../shared/ui';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { getDemoPreviewDisplayDay } from './workspaceRightSidebarReviewQueueDays';
import { collectDemoFlowNodeIds, DemoDayLabel, renderDemoDaySections } from './WorkspaceRightSidebarReviewQueueDemoSections';
import { buildDisplayQueueNodeIds, FlowSection } from './WorkspaceRightSidebarReviewQueueSections';

interface WorkspaceRightSidebarReviewQueuePanelProps {
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function QueueHeader({ demoDay }: { demoDay?: number }) {
  const t = useTranslation();
  return (
    <header className={`${inspectorListInsetPaddingClassName} pb-2 pt-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={`m-0 px-0 pb-0 ${inspectorListHeadingClassName}`}>{t('desktop.rightPanel.flow')}</h2>
        {demoDay ? <DemoDayLabel day={demoDay} /> : null}
      </div>
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
  currentDemoDayIndex: number;
  isDemo: boolean;
  t: Translate;
}) {
  const displayQueueNodeIds = buildDisplayQueueNodeIds(props.flowWindow.queueNodeIds, props.currentNodeId);
  const readyIndexOffset = displayQueueNodeIds.length;
  const futureIndexOffset = readyIndexOffset + props.flowWindow.readyNodeIds.length;
  return (
    <ol aria-label={props.t('desktop.rightPanel.flow.items')} className="min-h-0 flex-1 overflow-y-auto py-1">
      {props.isDemo
        ? renderDemoSections(props)
        : renderStandardSections({ ...props, displayQueueNodeIds, futureIndexOffset, readyIndexOffset })}
    </ol>
  );
}

function renderDemoSections(args: WorkspaceRightSidebarReviewQueuePanelProps & {
  currentDemoDayIndex: number;
  t: Translate;
}) {
  return renderDemoDaySections({
    currentDayIndex: args.currentDemoDayIndex,
    currentNodeId: args.currentNodeId,
    flowWindow: args.flowWindow,
    nodesById: args.nodesById,
    onSelectNode: args.onSelectNode,
    t: args.t
  });
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
  const demoState = useDemoRuntimeState();
  const { isDemo } = demoState;
  const flowNodeIds = isDemo ? collectDemoFlowNodeIds(props.flowWindow) : collectFlowNodeIds(props.flowWindow);
  if (flowNodeIds.length === 0) {
    return <EmptyQueueState />;
  }

  const missingQueueNodeId = flowNodeIds.find((nodeId) => !props.nodesById[nodeId]);
  if (missingQueueNodeId) {
    return null;
  }

  return (
    <section className="flex min-h-0 flex-col">
      <QueueHeader {...(isDemo ? { demoDay: getDemoPreviewDisplayDay(demoState.previewDay) } : {})} />
      <FlowPanelContent {...props} currentDemoDayIndex={demoState.previewDay} isDemo={isDemo} t={t} />
    </section>
  );
}
