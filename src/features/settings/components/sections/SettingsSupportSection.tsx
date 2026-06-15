import {
  Github,
  Youtube,
  type LucideIcon
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useAppVersion } from '../../../../shared/platform/appVersion';
import {
  checkForFolioleUpdates,
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
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsUpdateReleaseNotes } from './SettingsUpdateReleaseNotes';

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
  ariaLabel?: string | undefined;
  children: ReactNode;
  className?: string;
  commandId?: string | undefined;
  icon?: LucideIcon | undefined;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  onRunStart?: (() => void) | undefined;
  onRunAction?: (() => void) | undefined;
}) {
  const Icon = props.icon;
  const canRun = Boolean(props.onRunAction || (props.commandId && props.onRunSupportCommand));
  return (
    <button
      aria-label={props.ariaLabel}
      className={settingsButtonClassName(`gap-2 ${props.className ?? ''}`)}
      disabled={!canRun}
      onClick={() => {
        props.onRunStart?.();
        if (props.onRunAction) {
          props.onRunAction();
          return;
        }
        if (props.commandId) {
          props.onRunSupportCommand?.(props.commandId);
        }
      }}
      type="button"
    >
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-settings-icon-active" strokeWidth={1.8} /> : null}
      {props.children}
    </button>
  );
}

function VersionBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  const appRow = useLocalizedSettingsSearchRow('about-foliole-desktop');
  const appVersion = useAppVersion();
  const updateCheck = useUpdateCheckViewState();
  const status = updateCheck.status;

  return (
    <>
      <SettingsRow
        {...settingsSearchRowProps(appRow)}
        description={getUpdateDescription(updateCheck.state, status, t)}
        title={t('settings.about.versionTitle', { version: appVersion })}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppStatusBadge label={getUpdateStatusLabel(status, t)} tone={getUpdateStatusTone(status)} />
          <SupportButton commandId={APP_COMMAND_IDS.openLatestRelease} onRunSupportCommand={onRunSupportCommand}>
            {t('settings.about.openReleases')}
          </SupportButton>
          <SupportButton
            onRunAction={() => void checkForFolioleUpdates({ force: true })}
            onRunStart={() => updateCheck.setIsChecking(true)}
          >
            {t('settings.about.checkForUpdates')}
          </SupportButton>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsUpdateReleaseNotes currentVersion={appVersion} state={updateCheck.state} />
    </>
  );
}

function QuickLinksBlock({ onRunSupportCommand }: SettingsSupportSectionProps) {
  const t = useTranslation();
  const communityRow = useLocalizedSettingsSearchRow('about-community');
  return (
    <SettingsRow
      {...settingsSearchRowProps(communityRow)}
      description={communityRow.description}
      title={communityRow.title}
    >
      <SettingsControlSlot className="flex-wrap">
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubRepository} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          GitHub
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubDiscussions} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.discussions')}
        </SupportButton>
        <SupportButton commandId={APP_COMMAND_IDS.openGitHubIssues} icon={Github} onRunSupportCommand={onRunSupportCommand}>
          {t('settings.about.issues')}
        </SupportButton>
        <SupportButton
          commandId={APP_COMMAND_IDS.openYouTubePlaylist}
          icon={Youtube}
          onRunSupportCommand={onRunSupportCommand}
        >
          YouTube
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
