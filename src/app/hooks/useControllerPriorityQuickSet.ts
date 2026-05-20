import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { definedProps } from '../../shared/lib/definedProps';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { useCommandShortcutState } from './reviewHotkeysState';
import { usePriorityQuickSet } from './usePriorityQuickSet';

export function useControllerPriorityQuickSet(args: {
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return usePriorityQuickSet({
    activeNodeId: args.ws.activeNodeId,
    blocked:
      args.runtime.isCommandPaletteOpen ||
      args.runtime.isSearchPaletteOpen ||
      args.runtime.isSettingsOpen ||
      args.runtime.isGoToNodePaletteOpen ||
      args.runtime.isMoveToNodePaletteOpen ||
      args.runtime.isViewingTrashNode,
    onPriorityChange: args.ws.updateNodePriority,
    ...definedProps({ shortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.enterPriorityMode] })
  });
}
