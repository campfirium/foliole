import type { useWorkspaceRightSidebarAssistantPanelController } from './useWorkspaceRightSidebarAssistantPanelController';
import { WorkspaceRightSidebarAssistantModelControl } from './WorkspaceRightSidebarAssistantModelControl';

export function AssistantProviderAndModelControls(props: {
  controller: ReturnType<typeof useWorkspaceRightSidebarAssistantPanelController>;
}) {
  const controls = props.controller.providerControls;
  return controls.provider === 'codex-app-server'
    ? <WorkspaceRightSidebarAssistantModelControl controls={props.controller.modelControls} />
    : null;
}
