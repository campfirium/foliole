import type { useWorkspaceControllerState } from './appControllerState';

export function createPaletteSurfaceActions(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
}) {
  return {
    onOpenCommandPalette: () => {
      args.runtime.setIsSearchPaletteOpen(false);
      args.runtime.setIsGoToNodePaletteOpen(false);
      args.runtime.setIsMoveToNodePaletteOpen(false);
      args.runtime.setIsCommandPaletteOpen(true);
    },
    onOpenWorkspaceSearch: () => {
      args.runtime.setIsCommandPaletteOpen(false);
      args.runtime.setIsGoToNodePaletteOpen(false);
      args.runtime.setIsMoveToNodePaletteOpen(false);
      args.runtime.setIsSearchPaletteOpen(true);
    }
  };
}
