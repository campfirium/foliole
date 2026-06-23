import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { getDemoDisplayDayHeading, getDemoNodeDisplayDay } from './workspaceRightSidebarReviewQueueDays';
import { buildDisplayQueueNodeIds, FlowSection } from './WorkspaceRightSidebarReviewQueueSections';

export function DemoDayLabel({ day }: { day: number }) {
  const t = useTranslation();
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="text-ui-sm font-medium leading-5 text-foreground/58">
          {getDemoDisplayDayHeading(day, t)}
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent align="end" side="bottom" sideOffset={8}>
        {t('desktop.rightPanel.flow.demo.simulatedDataTooltip')}
      </AppTooltipContent>
    </AppTooltip>
  );
}

export function collectDemoFlowNodeIds(flowWindow: ReviewFlowWindow) {
  return [
    ...flowWindow.queueNodeIds,
    ...flowWindow.readyNodeIds,
    ...flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
  ];
}

function buildDemoDaySections(args: {
  currentDayIndex: number;
  flowWindow: ReviewFlowWindow;
  nodeIds: string[];
}) {
  const buckets = new Map<number, string[]>();
  args.nodeIds.forEach((nodeId) => {
    const day = getDemoNodeDisplayDay(args.currentDayIndex, args.flowWindow.dayOffsetByNodeId[nodeId] ?? 0);
    const bucket = buckets.get(day) ?? [];
    bucket.push(nodeId);
    buckets.set(day, bucket);
  });
  return [...buckets.entries()]
    .sort(([previousDay], [nextDay]) => previousDay - nextDay)
    .map(([day, nodeIds]) => ({ day, nodeIds }));
}

export function renderDemoDaySections(args: {
  currentDayIndex: number;
  currentNodeId: string | null;
  flowWindow: ReviewFlowWindow;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  t: Translate;
}) {
  return buildDemoDaySections({
    currentDayIndex: args.currentDayIndex,
    flowWindow: args.flowWindow,
    nodeIds: [
      ...buildDisplayQueueNodeIds(args.flowWindow.queueNodeIds, args.currentNodeId),
      ...args.flowWindow.readyNodeIds,
      ...args.flowWindow.dayBuckets.flatMap((bucket) => bucket.nodeIds)
    ]
  }).map((bucket, sectionIndex) => {
    return (
      <FlowSection
        heading={getDemoDisplayDayHeading(bucket.day, args.t)}
        indexOffset={0}
        key={bucket.day}
        nodeIds={bucket.nodeIds}
        nodesById={args.nodesById}
        onSelectNode={args.onSelectNode}
        showDivider={sectionIndex > 0}
      />
    );
  });
}
