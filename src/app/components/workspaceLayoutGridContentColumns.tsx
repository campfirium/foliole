import type { StudySessionCompleteSummaryProps } from './StudySessionCompleteSummary';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import {
  WorkspaceDocumentArea,
  WorkspaceListArea,
  type WorkspaceListAreaProps
} from './WorkspaceLayoutGridSections';
import { WorkspaceListSplitter, type WorkspaceListSplitterProps } from './WorkspaceListSplitter';
import { WorkspaceRightSidebar, type WorkspaceRightSidebarProps } from './WorkspaceRightSidebar';
import {
  WorkspaceRightSidebarSplitter,
  type WorkspaceRightSidebarSplitterProps
} from './WorkspaceRightSidebarSplitter';

export interface WorkspaceGridColumnProps {
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
  studySessionCompleteSummaryProps: StudySessionCompleteSummaryProps | null;
  isImmersiveMode: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listAreaProps: WorkspaceListAreaProps;
  listSplitterProps: WorkspaceListSplitterProps;
  rightSidebarProps: WorkspaceRightSidebarProps;
  rightSidebarSplitterProps: WorkspaceRightSidebarSplitterProps;
}

function renderDocumentColumn(
  args: Pick<WorkspaceGridColumnProps, 'documentSurfaceProps' | 'studySessionCompleteSummaryProps'>
) {
  return (
    <WorkspaceDocumentArea
      key="document"
      documentSurfaceProps={args.documentSurfaceProps}
      studySessionCompleteSummaryProps={args.studySessionCompleteSummaryProps}
    />
  );
}

function renderListColumns(
  args: Pick<WorkspaceGridColumnProps, 'isListCollapsed' | 'listAreaProps' | 'listSplitterProps'>
) {
  return [
    <div aria-hidden={args.isListCollapsed} className="flex min-w-0 flex-col overflow-hidden max-[1080px]:hidden" key="list">
      <WorkspaceListArea {...args.listAreaProps} />
    </div>,
    <div aria-hidden={args.isListCollapsed} className="flex min-w-0 overflow-visible max-[1080px]:hidden" key="list-splitter">
      <WorkspaceListSplitter {...args.listSplitterProps} />
    </div>
  ];
}

function renderRightSidebarColumns(
  args: Pick<
    WorkspaceGridColumnProps,
    'isRightSidebarCollapsed' | 'rightSidebarProps' | 'rightSidebarSplitterProps'
  >
) {
  return [
    <div
      aria-hidden={args.isRightSidebarCollapsed}
      className="hidden min-w-0 overflow-visible xl:flex"
      key="right-sidebar-splitter"
    >
      <WorkspaceRightSidebarSplitter {...args.rightSidebarSplitterProps} />
    </div>,
    <div
      aria-hidden={args.isRightSidebarCollapsed}
      className="hidden min-w-0 flex-col overflow-hidden xl:flex"
      key="right-sidebar"
    >
      <WorkspaceRightSidebar {...args.rightSidebarProps} />
    </div>
  ];
}

export function renderWorkspaceGridColumns(args: WorkspaceGridColumnProps) {
  if (args.isImmersiveMode) {
    return [renderDocumentColumn(args)];
  }

  return [
    ...renderListColumns(args),
    renderDocumentColumn(args),
    ...renderRightSidebarColumns(args)
  ];
}
