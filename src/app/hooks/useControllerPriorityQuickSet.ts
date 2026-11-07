import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { useCommandShortcutState } from './reviewHotkeysState';
import { usePriorityQuickSet } from './usePriorityQuickSet';

export function useControllerPriorityQuickSet(args: {
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const t = useTranslation();
  return usePriorityQuickSet({
    activeNodeId: args.ws.activeNodeId,
    blocked:
      args.runtime.isCommandPaletteOpen ||
      args.runtime.isSearchPaletteOpen ||
      args.runtime.isSettingsOpen ||
      args.runtime.isGoToNodePaletteOpen ||
      args.runtime.isMoveToNodePaletteOpen ||
      args.runtime.isViewingTrashNode,
    onPriorityChange: (nodeId, priority) => {
      args.ws.updateNodePriority(nodeId, priority);
      if (args.runtime.isImmersiveMode && args.ws.nodesById[nodeId]) {
        showAppRuntimeNotice(`${t('desktop.priorityQuickSet.title')}: P${priority}`, 'success', undefined, { durationMs: 1800 });
      }
    },
    ...definedProps({ shortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.enterPriorityMode] })
  });
}
