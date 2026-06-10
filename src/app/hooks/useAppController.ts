import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { useControllerCoreState } from './appControllerCoreState';
import { measureSelectionComputation } from './appControllerInstrumentation';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import { buildAppControllerResult } from './appControllerResult';
import { useControllerReviewEditingState } from './appControllerReviewEditingState';
import { useControllerStartupEffects } from './appControllerStartupEffects';
import { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppControllerResult } from './appControllerTypes';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useControllerAuxiliaryState } from './useControllerAuxiliaryState';
import { useControllerPaletteItems } from './useControllerPaletteItems';
import { useControllerPriorityQuickSet } from './useControllerPriorityQuickSet';
import { useCurrentNodeKeyboardShortcuts } from './useCurrentNodeKeyboardShortcuts';
import { useFormalImport } from './useFormalImport';
import { useReviewSessionRuntime } from './useReviewSessionRuntime';
import { useReviewTopicDelayPanel } from './useReviewTopicDelayPanel';

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
  reviewTopicDelayPanel: ReturnType<typeof useReviewTopicDelayPanel>;
  reviewPreview: ReturnType<typeof useReviewSessionRuntime>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  resumeReviewItem: () => void;
  startStudyMode: ReturnType<typeof useWorkspaceControllerState>['study']['startStudyMode'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const paletteItems = useControllerPaletteItems(args);
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
      reviewTopicDelayPanel: args.reviewTopicDelayPanel,
      reviewPreview: args.reviewPreview,
      reviewSettings: args.reviewSettings,
      resumeReviewItem: args.resumeReviewItem,
      startStudyMode: args.startStudyMode,
      ws: args.ws
    })
  );
  return { layoutProps, paletteItems };
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
  reviewTopicDelayPanel: ReturnType<typeof useReviewTopicDelayPanel>;
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
    reviewTopicDelayPanel: args.reviewTopicDelayPanel,
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

function useControllerQuickEntryState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isStudyMode: boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const priorityQuickSet = useControllerPriorityQuickSet({ hotkeys: args.hotkeys, runtime: args.controller.runtime, ws: args.ws });
  const reviewTopicDelayPanel = useReviewTopicDelayPanel({ ws: args.ws });
  useCurrentNodeKeyboardShortcuts({ controller: args.controller, isStudyMode: args.isStudyMode, ws: args.ws });
  return { priorityQuickSet, reviewTopicDelayPanel };
}

function useControllerAuxiliaryResult(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isStudyMode: boolean;
  layoutProps: ReturnType<typeof buildAppControllerLayoutProps>;
  onOpenHelpSearch: () => void;
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
  onSendFeedback: () => void;
  paletteItems: ReturnType<typeof useControllerPaletteItems>;
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useControllerAuxiliaryState(args);
}

export function useAppController(args: {
  onOpenHelpSearch: () => void;
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
  onSendFeedback: () => void;
}): AppControllerResult {
  const core = useControllerCoreState();
  const { appearance, controller, formalImport, hotkeys, isWorkspaceHydrated, nowIso, reviewSettings, ws } = core;
  const { exitStudyMode, isStudyMode, startStudyMode } = core.controller.study;
  const { priorityQuickSet, reviewTopicDelayPanel } = useControllerQuickEntryState({ controller, hotkeys, isStudyMode, ws });
  const reviewPreview = useReviewSessionRuntime({ isStudyMode, nowIso, reviewSettings, ws });
  useControllerStartupEffects({ controller, isStudyMode, isWorkspaceHydrated, startStudyMode, ws });
  const reviewEditing = useControllerReviewEditingState({
    controller,
    hotkeys,
    isStudyMode,
    nowIso,
    reviewSettings,
    ws
  });
  const { layoutProps, paletteItems } = useDerivedControllerState({
    appearance,
    controller,
    exitStudyMode,
    formalImport,
    hotkeys,
    isCurrentReviewItemGradable: reviewEditing.isCurrentReviewItemGradable,
    isReviewEditing: reviewEditing.isReviewEditing,
    isStudyMode,
    isWorkspaceHydrated,
    nowIso,
    priorityQuickSet,
    reviewTopicDelayPanel,
    reviewPreview,
    reviewSettings,
    resumeReviewItem: reviewEditing.resumeReviewItem,
    startStudyMode,
    ws
  });
  const auxiliaryState = useControllerAuxiliaryResult({
    appearance,
    controller,
    formalImport,
    hotkeys,
    isStudyMode,
    layoutProps,
    onOpenHelpSearch: args.onOpenHelpSearch,
    onOpenSearchPreview: args.onOpenSearchPreview,
    onSendFeedback: args.onSendFeedback,
    paletteItems,
    requestDeleteSourceTopic: reviewEditing.reviewSourceTopicDeleteDialog.requestDeleteSourceTopic,
    ws
  });

  return buildAppControllerResult({
    auxiliaryState,
    controller,
    layoutProps,
    reviewSourceTopicDeleteDialog: reviewEditing.reviewSourceTopicDeleteDialog,
    reviewTopicDelayPanel
  });
}
