import { useEffect, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import {
  readUpdateCheckState,
  subscribeUpdateCheckState,
  type UpdateCheckState
} from '../../../../shared/platform/updateCheck';
import {
  AppStatusBadge,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { ABOUT_SETTINGS_SEARCH_ROWS } from '../../model/settingsSearchRowCatalog';

const ABOUT_ROW = {
  app: ABOUT_SETTINGS_SEARCH_ROWS[0]!,
  community: ABOUT_SETTINGS_SEARCH_ROWS[3]!
};

interface SettingsSupportSectionProps {
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
}

type UpdateViewStatus = 'available' | 'checking' | 'current' | 'failed' | 'idle';

function getUpdateViewStatus(state: UpdateCheckState, isChecking: boolean): UpdateViewStatus {
  if (isChecking) return 'checking';
  if (state.lastCheckStatus === 'available' && state.latestVersion) return 'available';
  if (state.lastCheckStatus === 'current') return 'current';
  if (state.lastCheckStatus === 'failed') return 'failed';
  return 'idle';
}

function getUpdateStatusLabel(status: UpdateViewStatus) {
  if (status === 'checking') return 'Checking';
  if (status === 'available') return 'Update available';
  if (status === 'current') return 'Up to date';
  if (status === 'failed') return 'Check failed';
  return 'Not checked';
}

function getUpdateStatusTone(status: UpdateViewStatus) {
  if (status === 'available') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'checking') return 'info';
  return 'neutral';
}

function getUpdateDescription(state: UpdateCheckState, status: UpdateViewStatus) {
  if (status === 'checking') return 'Checking for updates...';
  if (status === 'available') return `Foliole ${state.latestVersion} is available.`;
  if (status === 'current') return 'Foliole is up to date.';
  if (status === 'failed') return 'Could not check for updates.';
  return 'Current Foliole desktop version.';
}

function useUpdateCheckViewState() {
  const [state, setState] = useState(readUpdateCheckState);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(
    () =>
      subscribeUpdateCheckState(() => {
        setState(readUpdateCheckState());
        setIsChecking(false);
      }),
    []
  );

  return {
    setIsChecking,
    state,
    status: getUpdateViewStatus(state, isChecking)
  };
}

function SupportButton(props: {
  children: string;
  className?: string;
  commandId: string;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  onRunStart?: (() => void) | undefined;
}) {
  return (
    <button
      className={settingsButtonClassName(props.className)}
      disabled={!props.onRunSupportCommand}
      onClick={() => {
        props.onRunStart?.();
        props.onRunSupportCommand?.(props.commandId);
      }}
      type="button"
    >
      {props.children}
    </button>
  );
}

function VersionBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const updateCheck = useUpdateCheckViewState();
  const status = updateCheck.status;

  return (
    <SettingsRow
      {...settingsSearchRowProps(ABOUT_ROW.app)}
      description={getUpdateDescription(updateCheck.state, status)}
      title="Version 0.60"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppStatusBadge label={getUpdateStatusLabel(status)} tone={getUpdateStatusTone(status)} />
        <SupportButton commandId={APP_COMMAND_IDS.openLatestRelease} onRunSupportCommand={onRunSupportCommand}>
          Open releases
        </SupportButton>
        <SupportButton
          commandId={APP_COMMAND_IDS.checkForUpdates}
          onRunStart={() => updateCheck.setIsChecking(true)}
          onRunSupportCommand={onRunSupportCommand}
        >
          Check for Updates
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <SettingsRow
      {...settingsSearchRowProps(ABOUT_ROW.community)}
      description={ABOUT_ROW.community.description}
      title={ABOUT_ROW.community.title}
    >
      <SettingsControlSlot className="flex-wrap">
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubRepository} onRunSupportCommand={onRunSupportCommand}>
          GitHub
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubDiscussions} onRunSupportCommand={onRunSupportCommand}>
          Discussions
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} onRunSupportCommand={onRunSupportCommand}>
          Feedback
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsSupportSection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  return (
    <SettingsSection ariaLabel="About settings section">
      <VersionBlock onRunSupportCommand={onRunSupportCommand} />
      <QuickLinksBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}
