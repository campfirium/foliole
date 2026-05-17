import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';
import { AppPanel } from '../../shared/ui';

import {
  renderWorkspaceRightSidebarPanel,
  type WorkspaceRightSidebarPanelProps
} from './WorkspaceRightSidebarPanels';

export interface WorkspaceRightSidebarProps extends Omit<WorkspaceRightSidebarPanelProps, 'outlineActivePosition'> {
  outlineActivePosition?: number;
}

export function WorkspaceRightSidebar(props: WorkspaceRightSidebarProps) {
  recordComponentRender('rightSidebar');
  const panelProps = {
    ...props,
    outlineActivePosition: props.outlineActivePosition ?? 0
  };
  return (
    <AppPanel
      aria-label="Inspector"
      as="aside"
      bodyClassName="app-scrollbar overflow-y-auto px-3 py-3"
      className="workspace-region-main-sidebar hidden min-h-0 h-full flex-col overflow-hidden text-foreground xl:flex"
      headerClassName="hidden"
      title={null}
    >
      {renderWorkspaceRightSidebarPanel(panelProps)}
    </AppPanel>
  );
}
