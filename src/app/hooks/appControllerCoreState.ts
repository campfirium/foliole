import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';

import { useNowIso, useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { APP_SHORTCUT_COMMAND_IDS, useCommandShortcutState } from './reviewHotkeysState';
import { useFormalImport } from './useFormalImport';
import { useWorkspaceHydration } from './useWorkspaceHydration';

export function useControllerCoreState() {
  const ws = useWorkspaceSelectors();
  const appearance = useAppearanceSettings();
  const reviewSettings = useReviewSchedulerSettings();
  const nowIso = useNowIso();
  const isWorkspaceHydrated = useWorkspaceHydration();
  const controller = useWorkspaceControllerState(ws, isWorkspaceHydrated);
  const formalImport = useFormalImport();
  const hotkeys = useCommandShortcutState(APP_SHORTCUT_COMMAND_IDS);
  return { appearance, controller, formalImport, hotkeys, isWorkspaceHydrated, nowIso, reviewSettings, ws };
}
