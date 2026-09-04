import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { getDemoRuntimeNowIso } from '../../shared/platform/runtime/demoRuntime';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import type { useReviewSourceTopicDeleteDialog } from './appControllerReviewSourceDelete';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppControllerResult } from './appControllerTypes';
import type { useCommandShortcutState } from './reviewHotkeysState';
import { openCompanionSyncSettings } from './settingsOverlayRequest';
import type { useControllerAuxiliaryState } from './useControllerAuxiliaryState';
import type { useReviewTopicDelayPanel } from './useReviewTopicDelayPanel';

export function buildAppControllerResult(args: {
  auxiliaryState: ReturnType<typeof useControllerAuxiliaryState>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  layoutProps: WorkspaceLayoutProps;
  reviewSourceTopicDeleteDialog: ReturnType<typeof useReviewSourceTopicDeleteDialog>;
  reviewTopicDelayPanel: ReturnType<typeof useReviewTopicDelayPanel>;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): AppControllerResult {
  return {
    hotkeySettings: {
      ...args.auxiliaryState.hotkeySettings,
      publicCommandItems: args.auxiliaryState.paletteState.items,
      onRunPublicCommand: args.auxiliaryState.paletteState.onRunCommand
    },
    goToNodeState: args.auxiliaryState.goToNodeState,
    moveToNodeState: args.auxiliaryState.moveToNodeState,
    layoutProps: args.layoutProps,
    onStartNextDemoPreviewDayFlow: () => {
      if (!args.ws.startReviewSession(getDemoRuntimeNowIso(), { includeScheduledFallback: true }))
        return false;
      args.layoutProps.nodeList.onOpenNotesView();
      args.controller.study.startStudyMode({ force: true });
      return true;
    },
    onOpenCompanionSyncSettings: () => openCompanionSyncSettings(args.controller.runtime),
    paletteState: args.auxiliaryState.paletteState,
    reviewSourceTopicDeleteDialog: {
      isOpen: args.reviewSourceTopicDeleteDialog.isOpen,
      deleteSourceTopicShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.deleteReviewSourceTopic],
      nodeTitle: args.reviewSourceTopicDeleteDialog.nodeTitle,
      onCancel: args.reviewSourceTopicDeleteDialog.onCancel,
      onConfirm: args.reviewSourceTopicDeleteDialog.onConfirm
    },
    reviewTopicDelayPanel: args.reviewTopicDelayPanel,
    searchState: args.auxiliaryState.searchState
  };
}
