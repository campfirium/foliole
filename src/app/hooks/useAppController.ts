import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { measureSelectionComputation } from './appControllerInstrumentation';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import { useAppControllerReviewEditing } from './appControllerReviewEditing';
import { useReviewSourceTopicDeleteDialog } from './appControllerReviewSourceDelete';
import { useNowIso, useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppControllerResult } from './appControllerTypes';
import { countDueReviewNodes } from './layoutPropsBuilder';
import { APP_SHORTCUT_COMMAND_IDS, useCommandShortcutState } from './reviewHotkeysState';
import { openCompanionSyncSettings } from './settingsOverlayRequest';
import { useControllerAuxiliaryState } from './useControllerAuxiliaryState';
import { useControllerPaletteItems } from './useControllerPaletteItems';
import { useControllerPriorityQuickSet } from './useControllerPriorityQuickSet';
import { useCurrentNodeKeyboardShortcuts } from './useCurrentNodeKeyboardShortcuts';
import { useFormalImport } from './useFormalImport';
import { useResumeReviewItem } from './useResumeReviewItem';
import { useReviewQueueDocumentPrefetch } from './useReviewQueueDocumentPrefetch';
import { useReviewSessionRuntime } from './useReviewSessionRuntime';
import { useWorkspaceHydration } from './useWorkspaceHydration';

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
  priorityQuickSet: ReturnType<typeof useControllerPriorityQuickSet>;
  reviewPreview: ReturnType<typeof useReviewSessionRuntime>;
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
  reviewSourceTopicDeleteDialog: ReturnType<typeof useReviewSourceTopicDeleteDialog>;
}): AppControllerResult {
  return {
    hotkeySettings: args.auxiliaryState.hotkeySettings,
    goToNodeState: args.auxiliaryState.goToNodeState,
    moveToNodeState: args.auxiliaryState.moveToNodeState,
    layoutProps: args.layoutProps,
    onOpenCompanionSyncSettings: () => openCompanionSyncSettings(args.controller.runtime),
    paletteState: args.auxiliaryState.paletteState,
    reviewSourceTopicDeleteDialog: {
      isOpen: args.reviewSourceTopicDeleteDialog.isOpen,
      nodeTitle: args.reviewSourceTopicDeleteDialog.nodeTitle,
      onCancel: args.reviewSourceTopicDeleteDialog.onCancel,
      onConfirm: args.reviewSourceTopicDeleteDialog.onConfirm
    },
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
  priorityQuickSet: ReturnType<typeof useControllerPriorityQuickSet>;
  reviewDueCount: number;
  reviewPreview: ReturnType<typeof useReviewSessionRuntime>;
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
  const reviewPreview = useReviewSessionRuntime({ isStudyMode, nowIso, reviewSettings, ws });
  useReviewQueueDocumentPrefetch(ws.reviewSession);
  const isCurrentReviewItemGradable = (ws.reviewSession.currentNodeId ? getReviewItemKind(ws.nodesById[ws.reviewSession.currentNodeId]) : null) === 'fsrs';
  const resumeReviewItem = useResumeReviewItem({ controller, nowIso, reviewSettings, ws });
  const reviewSourceTopicDeleteDialog = useReviewSourceTopicDeleteDialog(ws);
  const isReviewEditing = useAppControllerReviewEditing({
    controller,
    hotkeys,
    isCurrentReviewItemGradable,
    isStudyMode,
    resumeReviewItem,
    reviewSourceTopicDeleteDialog,
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
    requestDeleteSourceTopic: reviewSourceTopicDeleteDialog.requestDeleteSourceTopic,
    ws
  });

  return buildAppControllerResult({ auxiliaryState, controller, layoutProps, reviewSourceTopicDeleteDialog });
}
