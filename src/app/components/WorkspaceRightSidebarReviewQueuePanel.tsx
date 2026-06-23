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
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={`m-0 shrink-0 whitespace-nowrap px-0 pb-0 text-left ${inspectorListHeadingClassName}`}>{t('desktop.rightPanel.flow')}</h2>
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
  return [...flowWindow.queueNodeIds, ...flowWindow.readyNodeIds];
}

function FlowPanelContent(props: WorkspaceRightSidebarReviewQueuePanelProps & {
  currentDemoDayIndex: number;
  isDemo: boolean;
  t: Translate;
}) {
  const displayQueueNodeIds = buildDisplayQueueNodeIds(props.flowWindow.queueNodeIds, props.currentNodeId);
  const readyIndexOffset = displayQueueNodeIds.length;
  return (
    <ol aria-label={props.t('desktop.rightPanel.flow.items')} className="min-h-0 flex-1 overflow-y-auto py-1">
      {props.isDemo
        ? renderDemoSections(props)
        : renderStandardSections({ ...props, displayQueueNodeIds, readyIndexOffset })}
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
