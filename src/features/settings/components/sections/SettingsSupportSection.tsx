import { useEffect, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useAppVersion } from '../../../../shared/platform/appVersion';
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
  community: ABOUT_SETTINGS_SEARCH_ROWS[2]!
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

type Translate = ReturnType<typeof useTranslation>;

function getUpdateStatusLabel(status: UpdateViewStatus, t: Translate) {
  if (status === 'checking') return t('settings.about.update.checking');
  if (status === 'available') return t('settings.about.update.available');
  if (status === 'current') return t('settings.about.update.current');
  if (status === 'failed') return t('settings.about.update.failed');
  return t('settings.about.update.idle');
}

function getUpdateStatusTone(status: UpdateViewStatus) {
  if (status === 'available') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'checking') return 'info';
  return 'neutral';
}

function getUpdateDescription(state: UpdateCheckState, status: UpdateViewStatus, t: Translate) {
  if (status === 'checking') return t('settings.about.update.description.checking');
  if (status === 'available') return t('settings.about.update.description.available', { version: state.latestVersion ?? '' });
  if (status === 'current') return t('settings.about.update.description.current');
  if (status === 'failed') return t('settings.about.update.description.failed');
  return t('settings.about.update.description.idle');
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
  const t = useTranslation();
  const appVersion = useAppVersion();
  const updateCheck = useUpdateCheckViewState();
  const status = updateCheck.status;

  return (
    <SettingsRow
      {...settingsSearchRowProps(ABOUT_ROW.app)}
      description={getUpdateDescription(updateCheck.state, status, t)}
      title={t('settings.about.versionTitle', { version: appVersion })}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppStatusBadge label={getUpdateStatusLabel(status, t)} tone={getUpdateStatusTone(status)} />
        <SupportButton commandId={APP_COMMAND_IDS.openLatestRelease} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.openReleases')}
        </SupportButton>
        <SupportButton
          commandId={APP_COMMAND_IDS.checkForUpdates}
          onRunStart={() => updateCheck.setIsChecking(true)}
          onRunSupportCommand={onRunSupportCommand}
        >
          {t('settings.about.checkForUpdates')}
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
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
          {t('settings.about.discussions')}
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.feedback')}
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openYouTubePlaylist} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.youtubeInProgress')}
        </SupportButton>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsAppSection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.about.app.aria')} title={t('settings.about.app.section')}>
      <VersionBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}

export function SettingsCommunitySection({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  return (
    <SettingsSection ariaLabel={t('settings.about.community.aria')} title={t('settings.about.community.section')}>
      <QuickLinksBlock onRunSupportCommand={onRunSupportCommand} />
    </SettingsSection>
  );
}
