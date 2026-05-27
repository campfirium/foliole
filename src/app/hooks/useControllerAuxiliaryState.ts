import { useMemo } from 'react';

import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
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
import { useFormalImport } from './useFormalImport';
import { useNativeCommandMenu } from './useNativeCommandMenu';

function useAppCommandShortcuts(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  paletteState: ReturnType<typeof buildControllerPaletteState>;
}) {
  useNativeCommandMenu(args.paletteState.items, args.paletteState.onRunCommand);
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen:
      args.controller.runtime.isCommandPaletteOpen ||
      args.controller.runtime.isGoToNodePaletteOpen ||
      args.controller.runtime.isMoveToNodePaletteOpen ||
      args.controller.runtime.isSearchPaletteOpen ||
      args.controller.runtime.isSettingsOpen,
    items: args.paletteState.items,
    runCommand: args.paletteState.onRunCommand,
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
  onOpenSearchPreview: (result: WorkspaceSearchResult) => void;
  paletteItems: CommandPaletteItem[];
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const paletteState = buildControllerPaletteState({
    appearance: args.appearance,
    formalImport: args.formalImport,
    isStudyMode: args.isStudyMode,
    layoutProps: args.layoutProps,
    nav: args.controller.nav,
    onOpenHelpSearch: args.onOpenHelpSearch,
    paletteItems: args.paletteItems,
    requestDeleteSourceTopic: args.requestDeleteSourceTopic,
    runtime: args.controller.runtime,
    study: args.controller.study,
    trash: args.controller.trash,
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
