import { useEffect, useState } from 'react';

import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useAppVersion } from '../../../../shared/platform/appVersion';
import {
  downloadDesktopUpdate,
  installDesktopUpdate,
  readDesktopUpdateState,
  subscribeDesktopUpdateState
} from '../../../../shared/platform/desktopUpdate';
import {
  checkForFolioleUpdates,
  readUpdateCheckState,
  subscribeUpdateCheckState,
  type UpdateCheckState
} from '../../../../shared/platform/updateCheck';
import { AppStatusBadge, SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow } from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

import { SettingsSupportButton } from './SettingsSupportButton';
import { SettingsUpdateReleaseNotes } from './SettingsUpdateReleaseNotes';

type ViewStatus = 'available' | 'checking' | 'current' | 'downloading' | 'failed' | 'idle' | 'pending-asset' | 'ready';
type Translate = ReturnType<typeof useTranslation>;

function resolveViewStatus(state: UpdateCheckState, desktopPhase: string, isChecking: boolean): ViewStatus {
  if (isChecking || desktopPhase === 'checking') return 'checking';
  if (state.lastCheckStatus === 'failed' || desktopPhase === 'error') return 'failed';
  if (state.lastCheckStatus === 'available') {
    if (desktopPhase === 'pending-asset') return 'pending-asset';
    if (desktopPhase === 'downloading') return 'downloading';
    if (desktopPhase === 'ready') return 'ready';
    return 'available';
  }
  if (state.lastCheckStatus === 'current') return 'current';
  return 'idle';
}

function statusLabel(status: ViewStatus, t: Translate) {
  return t(`settings.about.update.${status}`);
}

function statusDescription(status: ViewStatus, state: UpdateCheckState, percent: number | undefined, t: Translate) {
  if (status === 'available') return t('settings.about.update.description.available', { version: state.latestVersion ?? '' });
  if (status === 'downloading') return t('settings.about.update.description.downloading', { percent: Math.round(percent ?? 0) });
  return t(`settings.about.update.description.${status}`);
}

function statusTone(status: ViewStatus) {
  if (status === 'available' || status === 'ready') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'checking' || status === 'downloading' || status === 'pending-asset') return 'info';
  return 'neutral';
}

function useUpdateViewState() {
  const [manifest, setManifest] = useState(readUpdateCheckState);
  const [desktop, setDesktop] = useState(readDesktopUpdateState);
  const [isChecking, setIsChecking] = useState(false);
  useEffect(() => subscribeUpdateCheckState(() => setManifest(readUpdateCheckState())), []);
  useEffect(() => subscribeDesktopUpdateState(() => setDesktop(readDesktopUpdateState())), []);
  return { desktop, isChecking, manifest, setIsChecking };
}

export function SettingsVersionBlock(props: { onRunSupportCommand?: ((commandId: string) => void) | undefined }) {
  const t = useTranslation();
  const appRow = useLocalizedSettingsSearchRow('about-foliole-desktop');
  const appVersion = useAppVersion();
  const update = useUpdateViewState();
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const status = resolveViewStatus(update.manifest, update.desktop.phase, update.isChecking);
  const handleCheck = async () => {
    update.setIsChecking(true);
    const result = await checkForFolioleUpdates({ force: true });
    update.setIsChecking(false);
    if (result.status === 'available') setReleaseNotesOpen(true);
  };

  return (
    <>
      <SettingsRow
        {...settingsSearchRowProps(appRow)}
        description={statusDescription(status, update.manifest, update.desktop.percent, t)}
        title={t('settings.about.versionTitle', { version: appVersion })}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <AppStatusBadge label={statusLabel(status, t)} tone={statusTone(status)} />
          <SettingsSupportButton commandId={APP_COMMAND_IDS.openLatestRelease} onRunSupportCommand={props.onRunSupportCommand}>
            {t('settings.about.openReleases')}
          </SettingsSupportButton>
          {update.manifest.lastCheckStatus === 'available' ? (
            <SettingsSupportButton onRunAction={() => setReleaseNotesOpen(true)}>{t('settings.about.viewUpdateDetails')}</SettingsSupportButton>
          ) : null}
          {update.desktop.phase === 'available' ? (
            <SettingsSupportButton onRunAction={() => void downloadDesktopUpdate()}>{t('settings.about.downloadUpdate')}</SettingsSupportButton>
          ) : null}
          {update.desktop.phase === 'ready' ? (
            <SettingsSupportButton onRunAction={() => void installDesktopUpdate()}>{t('settings.about.restartToInstall')}</SettingsSupportButton>
          ) : null}
          {update.desktop.phase !== 'downloading' && update.desktop.phase !== 'ready' ? (
            <SettingsSupportButton onRunAction={() => void handleCheck()}>{t('settings.about.checkForUpdates')}</SettingsSupportButton>
          ) : null}
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsUpdateReleaseNotes currentVersion={appVersion} onOpenChange={setReleaseNotesOpen} open={releaseNotesOpen} state={update.manifest} />
    </>
  );
}
