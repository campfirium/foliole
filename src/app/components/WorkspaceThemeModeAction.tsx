import { useContext } from 'react';

import { AppearanceSettingsContext } from '../../features/settings/context/appearanceSettingsContext';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { WorkspaceAppearanceModeIcon } from './WorkspaceAppearanceModeIcon';
import {
  WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME,
  WorkspaceRailTooltipButton
} from './WorkspaceRailTooltipButton';

export function WorkspaceThemeModeAction(props: { onRunRailAction?: (commandId: string) => void }) {
  const t = useTranslation();
  const appearance = useContext(AppearanceSettingsContext);
  const mode = appearance?.baseColorMode ?? 'light';
  const modeLabel = mode === 'system'
    ? t('desktop.workspace.appearanceMode.systemCurrent', {
      resolved: appearance?.resolvedBaseColorMode === 'dark'
        ? t('settings.appearance.colorMode.dark')
        : t('settings.appearance.colorMode.light')
    })
    : mode === 'dark' ? t('settings.appearance.colorMode.dark') : t('settings.appearance.colorMode.light');

  function runThemeToggle() {
    if (props.onRunRailAction) {
      props.onRunRailAction(APP_COMMAND_IDS.toggleBaseColorMode);
      return;
    }
    appearance?.toggleBaseColorMode();
  }

  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <WorkspaceRailTooltipButton
        className={`size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground ${WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME}`}
        icon={<WorkspaceAppearanceModeIcon showSelectedMode={appearance?.isBaseColorModeSelectionActive ?? false} />}
        label={t('desktop.workspace.appearanceMode.current', { mode: modeLabel })}
        onClick={runThemeToggle}
      />
    </div>
  );
}
