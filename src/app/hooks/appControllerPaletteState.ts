import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildPaletteState } from './appControllerHelpers';
import { createPaletteRunnerArgs } from './appControllerPaletteRunnerArgs';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
import type { useFormalImport } from './useFormalImport';

export function buildControllerPaletteState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  paletteItems: CommandPaletteItem[];
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runPaletteCommand = createPaletteCommandRunner(createPaletteRunnerArgs(args));

  return buildPaletteState(
    args.runtime.isCommandPaletteOpen,
    args.paletteItems,
    args.runtime.recentCommandIds,
    () => args.runtime.setIsCommandPaletteOpen(false),
    runPaletteCommand
  );
}
