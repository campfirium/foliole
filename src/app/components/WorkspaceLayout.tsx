import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
export type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
export type { WorkspaceEditorContextMenu } from './workspaceLayoutProps';

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return <WorkspaceLayoutMain {...props} />;
}
