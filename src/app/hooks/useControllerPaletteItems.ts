import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useAppPaletteItems } from './useAppPaletteItems';
import { useFormalImport } from './useFormalImport';

export function useControllerPaletteItems(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  reviewDueCount: number;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useAppPaletteItems({
    activeNodeId: args.ws.activeNodeId,
    formalImportAvailable: args.formalImport.isAvailable && !args.formalImport.isImporting,
    hasReviewCard: Boolean(args.ws.reviewSession.currentNodeId),
    hotkeys: args.hotkeys,
    isImmersiveMode: args.controller.runtime.isImmersiveMode,
    resolvedBaseColorMode: args.appearance.resolvedBaseColorMode,
    isViewingTrashNode: args.controller.runtime.isViewingTrashNode,
    isCurrentReviewItemGradable: args.isCurrentReviewItemGradable,
    isStudyMode: args.isStudyMode,
    nav: args.controller.nav,
    reviewSession: args.ws.reviewSession,
    reviewDueCount: args.reviewDueCount,
    study: args.controller.study,
    ws: args.ws
  });
}
