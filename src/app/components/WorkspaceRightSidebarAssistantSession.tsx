import { useState } from 'react';

import { PanelScaleSurface } from '../../shared/ui';

import { getWorkspaceRightPanelDefinition } from './workspaceRightPanelDefinitions';
import { renderWorkspaceRightSidebarPanel, type WorkspaceRightSidebarPanelProps } from './WorkspaceRightSidebarPanels';

export function WorkspaceRightSidebarAssistantSession(props: {
  panelProps: WorkspaceRightSidebarPanelProps;
  visible: boolean;
}) {
  const [opened, setOpened] = useState(props.visible);
  if (props.visible && !opened) setOpened(true);
  if (!opened && !props.visible) return null;

  return (
    <div
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
      data-panel-content-root="assistant"
      hidden={!props.visible}
      inert={!props.visible}
      style={{ display: props.visible ? 'flex' : 'none' }}
    >
      <PanelScaleSurface label={getWorkspaceRightPanelDefinition('assistant').menuLabel} panelId="right-panel:assistant">
        {renderWorkspaceRightSidebarPanel({ ...props.panelProps, activePanelId: 'assistant' })}
      </PanelScaleSurface>
    </div>
  );
}
