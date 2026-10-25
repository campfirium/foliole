import { FlowExitHereContext } from '../../shared/ui/FlowExitHereContext';

import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
export type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
export type { WorkspaceEditorContextMenu } from './workspaceLayoutProps';

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const canExitHere = props.review.isStudyMode && props.navigation.activeNodeId
    && props.navigation.activeNodeId !== props.review.reviewCurrentNodeId
    && !props.externalLibrary.isExternalViewOpen && !props.trash.isTrashViewOpen;
  return <FlowExitHereContext.Provider value={canExitHere ? props.review.onExitFlowHere ?? null : null}>
    <WorkspaceLayoutMain {...props} />
  </FlowExitHereContext.Provider>;
}
