import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';
import { getReviewSchedulerSettingsSignature } from '../../features/settings/model/reviewSchedulerSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { definedProps } from '../../shared/lib/definedProps';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { useCurrentReviewPreview } from './appControllerHelpers';
import { measureSelectionComputation } from './appControllerInstrumentation';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import { useReviewEditingState } from './appControllerReviewEditing';
import { useNowIso, useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppControllerResult } from './appControllerTypes';
import { countDueReviewNodes } from './layoutPropsBuilder';
import { APP_SHORTCUT_COMMAND_IDS, useCommandShortcutState } from './reviewHotkeysState';
import { openCompanionSyncSettings } from './settingsOverlayRequest';
import { useControllerAuxiliaryState } from './useControllerAuxiliaryState';
import { useControllerPaletteItems } from './useControllerPaletteItems';
import { useCurrentNodeKeyboardShortcuts } from './useCurrentNodeKeyboardShortcuts';
import { useFormalImport } from './useFormalImport';
import { usePriorityQuickSet } from './usePriorityQuickSet';
import { useResumeReviewItem } from './useResumeReviewItem';
import { useReviewQueueDocumentPrefetch } from './useReviewQueueDocumentPrefetch';
import { useWorkspaceHydration } from './useWorkspaceHydration';

function useControllerPriorityQuickSet(args: {
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

function useDerivedControllerState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  exitStudyMode: () => void;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  isWorkspaceHydrated: boolean;
  nowIso: string;
  priorityQuickSet: ReturnType<typeof usePriorityQuickSet>;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  resumeReviewItem: () => void;
  startStudyMode: ReturnType<typeof useWorkspaceControllerState>['study']['startStudyMode'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const reviewDueCount = measureSelectionComputation(
    args.ws.activeNodeId,
    args.ws.nodeOrder.length,
    'review_due_count',
    () =>
      countDueReviewNodes(
        args.ws.nodeOrder,
        args.ws.nodesById,
        args.ws.trashedNodeIds,
        args.nowIso,
        args.reviewSettings.reviewSchedulerSettings.pushQueue
      )
  );
  const paletteItems = useControllerPaletteItems({ ...args, reviewDueCount });
  const layoutProps = measureSelectionComputation(args.ws.activeNodeId, args.ws.nodeOrder.length, 'layout_props', () =>
    buildControllerLayoutState({
      controller: args.controller,
      exitStudyMode: args.exitStudyMode,
      formalImport: args.formalImport,
      isReviewEditing: args.isReviewEditing,
      isStudyMode: args.isStudyMode,
      isWorkspaceHydrated: args.isWorkspaceHydrated,
      nowIso: args.nowIso,
      priorityQuickSet: args.priorityQuickSet,
      reviewDueCount,
      reviewPreview: args.reviewPreview,
      reviewSettings: args.reviewSettings,
      resumeReviewItem: args.resumeReviewItem,
      startStudyMode: args.startStudyMode,
      ws: args.ws
    })
  );
  return { layoutProps, paletteItems };
}

function buildAppControllerResult(args: {
  auxiliaryState: ReturnType<typeof useControllerAuxiliaryState>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  layoutProps: WorkspaceLayoutProps;
}): AppControllerResult {
  return {
    hotkeySettings: args.auxiliaryState.hotkeySettings,
    goToNodeState: args.auxiliaryState.goToNodeState,
    moveToNodeState: args.auxiliaryState.moveToNodeState,
    layoutProps: args.layoutProps,
    onOpenCompanionSyncSettings: () => openCompanionSyncSettings(args.controller.runtime),
    paletteState: args.auxiliaryState.paletteState,
    searchState: args.auxiliaryState.searchState
  };
}

function buildControllerLayoutState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  exitStudyMode: () => void;
  formalImport: ReturnType<typeof useFormalImport>;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  isWorkspaceHydrated: boolean;
  nowIso: string;
  priorityQuickSet: ReturnType<typeof usePriorityQuickSet>;
  reviewDueCount: number;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  resumeReviewItem: () => void;
  startStudyMode: ReturnType<typeof useWorkspaceControllerState>['study']['startStudyMode'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return buildAppControllerLayoutProps({
    activeNode: args.controller.activeNode,
    canStartStudyMode: args.controller.study.canStartStudyMode,
    editorCtx: args.controller.editorCtx,
    exitStudyMode: args.exitStudyMode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    isReviewEditing: args.isReviewEditing,
    isStudyMode: args.isStudyMode,
    listResize: args.controller.listResize,
    nav: args.controller.nav,
    nowIso: args.nowIso,
    priorityQuickSet: args.priorityQuickSet,
    reviewDueCount: args.reviewDueCount,
    reviewPreview: args.reviewPreview,
    reviewSettings: args.reviewSettings,
    resumeReviewItem: args.resumeReviewItem,
    rightSidebarResize: args.controller.rightSidebarResize,
    runtime: args.controller.runtime,
    runImportDirectory: args.formalImport.startImportDirectory,
    runClipboardImport: args.formalImport.startClipboardImport,
    runImportFile: args.formalImport.startImportFile,
    selectedTrashNode: args.controller.selectedTrashNode,
    startStudyMode: args.startStudyMode,
    externalView: args.controller.externalView,
    trash: args.controller.trash,
    virtualView: args.controller.virtualView,
    ws: args.ws
  });
}

export function useAppController(args: {
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
}): AppControllerResult {
  const ws = useWorkspaceSelectors();
  const appearance = useAppearanceSettings();
  const reviewSettings = useReviewSchedulerSettings();
  const nowIso = useNowIso();
  const isWorkspaceHydrated = useWorkspaceHydration();
  const controller = useWorkspaceControllerState(ws, isWorkspaceHydrated);
  const formalImport = useFormalImport();
  const { exitStudyMode, isStudyMode, startStudyMode } = controller.study;
  const hotkeys = useCommandShortcutState(APP_SHORTCUT_COMMAND_IDS);
  const priorityQuickSet = useControllerPriorityQuickSet({ hotkeys, runtime: controller.runtime, ws });
  useCurrentNodeKeyboardShortcuts({ controller, isStudyMode, ws });
  const reviewPreview = useCurrentReviewPreview(isStudyMode, ws, getReviewSchedulerSettingsSignature(reviewSettings.reviewSchedulerSettings));
  useReviewQueueDocumentPrefetch(ws.reviewSession);
  const isCurrentReviewItemGradable = (ws.reviewSession.currentNodeId ? getReviewItemKind(ws.nodesById[ws.reviewSession.currentNodeId]) : null) === 'fsrs';
  const resumeReviewItem = useResumeReviewItem({ controller, nowIso, reviewSettings, ws });
  const isReviewEditing = useReviewEditingState({
    hotkeys,
    isExternalViewOpen: controller.externalView.isExternalViewOpen,
    isCurrentReviewItemGradable,
    isStudyMode,
    isVirtualViewOpen: controller.virtualView.isVirtualViewOpen,
    onResumeReviewItem: resumeReviewItem,
    runtime: controller.runtime,
    ws
  });
  const { layoutProps, paletteItems } = useDerivedControllerState({
    appearance,
    controller,
    exitStudyMode,
    formalImport,
    hotkeys,
    isCurrentReviewItemGradable,
    isReviewEditing,
    isStudyMode,
    isWorkspaceHydrated,
    nowIso,
    priorityQuickSet,
    reviewPreview,
    reviewSettings,
    resumeReviewItem,
    startStudyMode,
    ws
  });
  const auxiliaryState = useControllerAuxiliaryState({
    appearance,
    controller,
    formalImport,
    hotkeys,
    isStudyMode,
    layoutProps,
    onOpenSearchPreview: args.onOpenSearchPreview,
    paletteItems,
    ws
  });

  return buildAppControllerResult({ auxiliaryState, controller, layoutProps });
}
