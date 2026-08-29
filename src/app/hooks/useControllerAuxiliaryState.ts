import { useMemo } from 'react';

import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import { buildControllerPaletteState } from './appControllerPaletteState';
import { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { buildControllerGoToNodeState } from './appGoToNodeState';
import { buildHotkeySettings } from './appHotkeySettings';
import { buildControllerMoveToNodeState } from './appMoveToNodeState';
import { buildControllerSearchState } from './appSearchState';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';
import { useAppCommandSurfaceShortcuts } from './useAppCommandSurfaceShortcuts';
import { useFormalImport } from './useFormalImport';
import { useFourWayNavigationCommandGate } from './useFourWayNavigationCommandGate';
import { useNativeCommandMenu } from './useNativeCommandMenu';

function useAppCommandShortcuts(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  paletteState: ReturnType<typeof buildControllerPaletteState>;
}) {
  const isCommandSurfaceOpen =
    args.controller.runtime.isCommandPaletteOpen ||
    args.controller.runtime.isGoToNodePaletteOpen ||
    args.controller.runtime.isImportManagementOpen ||
    args.controller.runtime.isMoveToNodePaletteOpen ||
    args.controller.runtime.isSearchPaletteOpen ||
    args.controller.runtime.isSettingsOpen;
  const runGuardedCommand = useFourWayNavigationCommandGate({
    isCommandSurfaceOpen,
    runCommand: args.paletteState.onRunCommand
  });
  useNativeCommandMenu(args.paletteState.items, runGuardedCommand);
  useAppCommandSurfaceShortcuts({
    isCommandPaletteOpen: args.controller.runtime.isCommandPaletteOpen,
    isSearchPaletteOpen: args.controller.runtime.isSearchPaletteOpen,
    isSettingsOpen: args.controller.runtime.isSettingsOpen,
    items: args.paletteState.items,
    runCommand: runGuardedCommand,
    setIsCommandPaletteOpen: args.controller.runtime.setIsCommandPaletteOpen,
    setIsSearchPaletteOpen: args.controller.runtime.setIsSearchPaletteOpen,
    shortcutMap: args.hotkeys.shortcutMap
  });
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen,
    items: args.paletteState.items,
    runCommand: runGuardedCommand,
    shortcutMap: args.hotkeys.shortcutMap
  });
}

function buildAuxiliarySearchState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  layoutProps: WorkspaceLayoutProps;
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return buildControllerSearchState({
    externalLibrary: {
      openExternalSelection: args.layoutProps.externalLibrary.onOpenExternalSelection
    },
    searchPreview: {
      openSearchPreview: args.onOpenSearchPreview
    },
    nav: args.controller.nav,
    runtime: args.controller.runtime,
    trash: args.controller.trash,
    virtualView: args.controller.virtualView,
    ws: args.ws
  });
}

export function useControllerAuxiliaryState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  onOpenHelpSearch: () => void;
  onSendFeedback: () => void;
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
  paletteItems: CommandPaletteItem[];
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const t = useTranslation();
  const paletteState = buildControllerPaletteState({
    appearance: args.appearance,
    demoOperationTranslate: t,
    externalView: args.controller.externalView,
    formalImport: args.formalImport,
    isStudyMode: args.isStudyMode,
    layoutProps: args.layoutProps,
    nav: args.controller.nav,
    onOpenHelpSearch: args.onOpenHelpSearch,
    onSendFeedback: args.onSendFeedback,
    paletteItems: args.paletteItems,
    requestDeleteSourceTopic: args.requestDeleteSourceTopic,
    runtime: args.controller.runtime,
    study: args.controller.study,
    trash: args.controller.trash,
    virtualView: args.controller.virtualView,
    ws: args.ws
  });
  const goToNodeState = buildControllerGoToNodeState({
    nav: args.controller.nav,
    runtime: args.controller.runtime,
    trash: args.controller.trash,
    virtualView: args.controller.virtualView,
    ws: args.ws
  });
  const moveToNodeState = buildControllerMoveToNodeState({ runtime: args.controller.runtime, ws: args.ws });
  const searchState = buildAuxiliarySearchState(args);

  useAppCommandShortcuts({ controller: args.controller, hotkeys: args.hotkeys, paletteState });
  const hotkeySettings = useMemo(
    () => buildHotkeySettings(args.paletteItems, args.hotkeys),
    [args.paletteItems, args.hotkeys]
  );

  return {
    goToNodeState,
    moveToNodeState,
    paletteState,
    searchState,
    hotkeySettings
  };
}
