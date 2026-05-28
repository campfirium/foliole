import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export function resolveOutlineActivePosition(args: {
  editorSelection?: { from: number } | null;
  readingSelection?: { from: number } | null;
}) {
  return args.readingSelection?.from ?? args.editorSelection?.from ?? 0;
}

export function resolveShowDocumentOutline(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  isImmersiveMode: boolean;
  isRightSidebarCollapsed: boolean;
}) {
  return args.isImmersiveMode || args.activeRightPanelId !== 'outline' || args.isRightSidebarCollapsed;
}
