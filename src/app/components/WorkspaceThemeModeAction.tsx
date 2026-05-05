import { Moon, Sun } from 'lucide-react';
import { useContext } from 'react';

import { AppearanceSettingsContext } from '../../features/settings/context/appearanceSettingsContext';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { ToolbarActionGroup } from '../../shared/ui';

import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';

export function WorkspaceThemeModeAction(props: { onRunRailAction?: (commandId: string) => void }) {
  const appearance = useContext(AppearanceSettingsContext);
  const Icon = appearance?.resolvedBaseColorMode === 'dark' ? Sun : Moon;

  function runThemeToggle() {
    if (props.onRunRailAction) {
      props.onRunRailAction(APP_COMMAND_IDS.toggleBaseColorMode);
      return;
    }
    appearance?.toggleBaseColorMode();
  }

  return (
    <ToolbarActionGroup
      ariaLabel="Workspace theme actions"
      className="h-[var(--workspace-top-toolbar-height)] w-full justify-center"
      fullWidth
      orientation="vertical"
    >
      <WorkspaceRailTooltipButton
        className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
        icon={<Icon aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Toggle Light/Dark Mode"
        onClick={runThemeToggle}
      />
    </ToolbarActionGroup>
  );
}
