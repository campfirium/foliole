import { VIRTUAL_PUBLISHED_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';

import { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { canScrollCurrentDocument } from './appPaletteDocumentScrollActions';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useAppPaletteItems } from './useAppPaletteItems';
import { useFormalImport } from './useFormalImport';

export function useControllerPaletteItems(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useAppPaletteItems({
    activeNodeId: args.ws.activeNodeId,
    canScrollCurrentDocument: canScrollCurrentDocument(args.controller.runtime.editorRef.current),
    formalImportAvailable: args.formalImport.isAvailable && !args.formalImport.isImporting,
    hasReviewCard: Boolean(args.ws.reviewSession.currentNodeId),
    hotkeys: args.hotkeys,
    isImmersiveMode: args.controller.runtime.isImmersiveMode,
    isEditorReadOnly: args.controller.runtime.isViewingTrashNode,
    isExternalViewOpen: args.controller.externalView.isExternalViewOpen,
    isFoliolePublishedContext:
      args.controller.virtualView.isVirtualViewOpen &&
      args.controller.virtualView.activeVirtualNodeId === VIRTUAL_PUBLISHED_NODE_ID,
    isReviewOnly: args.isStudyMode && !args.isReviewEditing,
    isViewingTrashNode: args.controller.runtime.isViewingTrashNode,
    isCurrentReviewItemGradable: args.isCurrentReviewItemGradable,
    isStudyMode: args.isStudyMode,
    nav: args.controller.nav,
    reviewSession: args.ws.reviewSession,
    study: args.controller.study,
    ws: args.ws
  });
}
