export interface WorkspaceGridColumnState {
  isImmersiveMode: boolean;
}

export function getWorkspaceGridColumns(props: WorkspaceGridColumnState) {
  if (props.isImmersiveMode) {
    return 'grid-cols-1 xl:grid-cols-1';
  }
  return '[grid-template-columns:minmax(0,var(--workspace-list-current-width,300px))_var(--workspace-list-splitter-width,1px)_minmax(0,1fr)] xl:[grid-template-columns:minmax(0,var(--workspace-list-current-width,300px))_var(--workspace-list-splitter-width,1px)_minmax(0,1fr)_var(--workspace-right-sidebar-splitter-width,1px)_minmax(0,var(--workspace-right-sidebar-current-width,320px))]';
}
