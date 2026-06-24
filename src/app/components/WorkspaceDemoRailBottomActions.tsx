import { House, MessageSquareWarning, MonitorDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { resetDemoExperience } from '../../shared/platform/runtime/demoRuntime';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { requestAppConfirmation, ToolbarActionGroup } from '../../shared/ui';

import { WorkspaceRailTooltipButton } from './WorkspaceRailTooltipButton';

const FOLIOLE_OFFICIAL_SITE_URL = 'https://foliole.app/';
const FOLIOLE_DOWNLOAD_URL = 'https://github.com/campfirium/foliole/releases';
const RAIL_BUTTON_CLASS_NAME =
  'size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-border-strong';

function DemoRailActionButton(props: Parameters<typeof WorkspaceRailTooltipButton>[0]) {
  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <WorkspaceRailTooltipButton {...props} />
    </div>
  );
}

export function WorkspaceDemoRailBottomActions({
  onRunRailAction
}: {
  onRunRailAction?: (commandId: string) => void;
}) {
  const t = useTranslation();
  const [isResetting, setIsResetting] = useState(false);

  async function resetDemo() {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('desktop.rightPanel.flow.demo.clear.cancel'),
      confirmLabel: t('desktop.workspace.demo.reset.confirm'),
      description: t('desktop.workspace.demo.reset.description'),
      title: t('desktop.workspace.demo.reset.title')
    });
    if (!confirmed) return;
    setIsResetting(true);
    await resetDemoExperience();
    setIsResetting(false);
  }

  return (
    <ToolbarActionGroup
      ariaLabel={t('desktop.workspace.demo.actions')}
      className="w-full gap-0"
      fullWidth
      orientation="vertical"
    >
      <DemoRailActionButton
        className={RAIL_BUTTON_CLASS_NAME}
        icon={<House aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.workspace.demo.home')}
        onClick={() => void openExternalUrl(FOLIOLE_OFFICIAL_SITE_URL)}
      />
      <DemoRailActionButton
        className={RAIL_BUTTON_CLASS_NAME}
        icon={<MonitorDown aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.workspace.demo.downloadApp')}
        onClick={() => void openExternalUrl(FOLIOLE_DOWNLOAD_URL)}
      />
      <DemoRailActionButton
        className={RAIL_BUTTON_CLASS_NAME}
        icon={<MessageSquareWarning aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={t('desktop.command.sendFeedback')}
        onClick={() => onRunRailAction?.(APP_COMMAND_IDS.sendFeedback)}
      />
      <DemoRailActionButton
        className={`${RAIL_BUTTON_CLASS_NAME} disabled:opacity-45`}
        disabled={isResetting}
        icon={<RotateCcw aria-hidden="true" size={16} strokeWidth={1.75} />}
        label={isResetting ? t('desktop.rightPanel.flow.demo.clearing') : t('desktop.workspace.demo.reset')}
        onClick={() => void resetDemo()}
      />
    </ToolbarActionGroup>
  );
}
