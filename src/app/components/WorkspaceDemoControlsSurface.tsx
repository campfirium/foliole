import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';

import { WorkspaceRightSidebarReviewQueueDemoControls } from './WorkspaceRightSidebarReviewQueueDemoControls';

export function WorkspaceDemoControlsSurface({
  flowWindow
}: {
  flowWindow?: ReviewFlowWindow;
}) {
  const hasUpcoming = Boolean(flowWindow?.upcomingNodeIds.length);
  return <WorkspaceRightSidebarReviewQueueDemoControls hasUpcoming={hasUpcoming} />;
}
