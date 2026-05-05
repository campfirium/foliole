import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildControllerPaletteState } from './appControllerPaletteState';
import { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { buildControllerGoToNodeState } from './appGoToNodeState';
import { buildHotkeySettings } from './appHotkeySettings';
import { buildControllerMoveToNodeState } from './appMoveToNodeState';
import { buildControllerSearchState } from './appSearchState';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useFormalImport } from './useFormalImport';
import { useNativeCommandMenu } from './useNativeCommandMenu';

export function useControllerAuxiliaryState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  controller: ReturnType<typeof useWorkspaceControllerState>;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  paletteItems: CommandPaletteItem[];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const paletteState = buildControllerPaletteState({
    appearance: args.appearance,
    formalImport: args.formalImport,
    isStudyMode: args.isStudyMode,
    layoutProps: args.layoutProps,
    nav: args.controller.nav,
    paletteItems: args.paletteItems,
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
  const searchState = buildControllerSearchState({
    nav: args.controller.nav,
    runtime: args.controller.runtime,
    trash: args.controller.trash,
    virtualView: args.controller.virtualView,
    ws: args.ws
  });

  useNativeCommandMenu(paletteState.items, paletteState.onRunCommand);

  return {
    goToNodeState,
    moveToNodeState,
    paletteState,
    searchState,
    hotkeySettings: buildHotkeySettings(args.paletteItems, args.hotkeys),
    isCurrentReviewItemGradable: getReviewItemKind(
      args.ws.reviewSession.currentNodeId ? args.ws.nodesById[args.ws.reviewSession.currentNodeId] : undefined
    ) === 'fsrs'
  };
}
