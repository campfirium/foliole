import { SettingsAttachmentStorageSection } from '../features/settings/components/sections/SettingsAttachmentStorageSection';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { SettingsTouchSurface } from '../shared/ui/SettingsTouchSurface';

import { CompanionClozeGuardSettingsContent } from './CompanionClozeGuardSettingsContent';
import { CompanionColorModeControl } from './CompanionColorModeControl';
import { useOptionalCompanionCustomCss } from './CompanionCustomCssProvider';
import { CompanionCustomCssSettingsContent } from './CompanionCustomCssSettingsContent';
import { CompanionFolderDatabaseBackupSection } from './CompanionFolderDatabaseBackupSection';
import { CompanionLanguageControl } from './CompanionLanguageControl';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';
import { CompanionReadingColorControls } from './CompanionReadingColorControls';
import { CompanionReviewStatisticsContent } from './CompanionReviewStatisticsContent';
import {
  CompanionPlaceholderSettingsContent,
  CompanionSettingsDetail,
  CompanionSettingsList
} from './CompanionSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
import { CompanionTestReviewReset } from './CompanionTestReviewReset';
import { CompanionTextScaleControl } from './CompanionTextScale';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

function resolvePlaceholderTitle(page: CompanionSettingsPage, t: ReturnType<typeof useTranslation>) {
  if (page === 'device') return t('companion.settings.device.placeholderTitle');
  if (page === 'appearance') return t('companion.settings.appearance.placeholderTitle');
  return t('companion.settings.debug.placeholderTitle');
}

function renderPlaceholderSettingsDetail(props: {
  detail: string;
  onBack: () => void;
  page: CompanionSettingsPage;
  placeholderTitle: string;
  title: string;
}) {
  return (
    <CompanionSettingsDetail onBack={props.onBack} page={props.page} title={props.title}>
      <CompanionPlaceholderSettingsContent
        detail={props.detail}
        title={props.placeholderTitle}
      />
    </CompanionSettingsDetail>
  );
}

type CompanionSettingsContentProps = {
  onBackToSettingsList: () => void;
  onOpenSyncSettings: () => void;
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  settingsPage: CompanionSettingsPage;
  workspaceSync: WorkspaceSync;
};

function CompanionAppearanceSettingsDetail(props: Pick<CompanionSettingsContentProps, 'onBackToSettingsList'>) {
  const t = useTranslation();
  const customCss = useOptionalCompanionCustomCss();
  return <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="appearance" title={t('companion.settings.appearance.title')}>
    <CompanionTextScaleControl />
    <CompanionLanguageControl />
    <CompanionColorModeControl />
    <CompanionReadingColorControls />
    {customCss?.isSupported ? <CompanionCustomCssSettingsContent /> : <CompanionPlaceholderSettingsContent
      detail={t('companion.settings.appearance.placeholderDetail')}
      title={resolvePlaceholderTitle('appearance', t)} />}
  </CompanionSettingsDetail>;
}

function supportsStorageSettings() {
  return supportsCompanionAppDataClear()
    || ['ios-native', 'browser-preview'].includes(getCompanionRuntimeCapability().kind);
}

function CompanionSettingsHome(props: CompanionSettingsContentProps) {
  return (
    <CompanionSettingsList
      onOpenAppearance={() => props.onOpenSyncSettingsPage('appearance')}
      onOpenClozeGuard={() => props.onOpenSyncSettingsPage('clozeGuard')}
      onOpenLearning={() => props.onOpenSyncSettingsPage('learning')}
      onOpenReviewStatistics={() => props.onOpenSyncSettingsPage('reviewStatistics')}
      onOpenDebug={() => props.onOpenSyncSettingsPage('debug')}
      onOpenBackup={() => props.onOpenSyncSettingsPage('backup')}
      onOpenAttachments={() => props.onOpenSyncSettingsPage('attachments')}
      onOpenSync={props.onOpenSyncSettings}
      showStorage={supportsStorageSettings()}
    />
  );
}

function CompanionSettingsContentSurface(props: CompanionSettingsContentProps) {
  const t = useTranslation();
  if (props.settingsPage === 'list' || props.settingsPage === 'storage') return <CompanionSettingsHome {...props} />;
  if (props.settingsPage === 'backup') return <CompanionFolderDatabaseBackupSection />;
  if (props.settingsPage === 'attachments') return <SettingsAttachmentStorageSection mobile unavailable={getCompanionRuntimeCapability().kind === 'browser-preview'} />;
  if (props.settingsPage === 'clozeGuard') return <CompanionClozeGuardSettingsContent />;
  if (props.settingsPage === 'learning') return <CompanionLearningSettingsContent />;
  if (props.settingsPage === 'reviewStatistics' || props.settingsPage === 'foregroundTime') return <CompanionReviewStatisticsContent
    libraryScope={props.workspaceSync.state.workspace_snapshot?.libraryScope ?? ''} />;
  if (props.settingsPage === 'device') {
    return renderPlaceholderSettingsDetail({
      detail: t('companion.settings.device.detail'),
      onBack: props.onBackToSettingsList,
      page: 'device',
      placeholderTitle: resolvePlaceholderTitle('device', t),
      title: t('companion.settings.device.title')
    });
  }
  if (props.settingsPage === 'appearance') {
    return <CompanionAppearanceSettingsDetail onBackToSettingsList={props.onBackToSettingsList} />;
  }
  if (props.settingsPage === 'debug') {
    return <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="debug" title={t('companion.settings.debug.title')}>
      <CompanionTestReviewReset />
    </CompanionSettingsDetail>;
  }
  return (
    <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="sync" title={t('companion.sync.deviceSync')}>
      <CompanionSyncContent
        page={props.settingsPage}
        workspaceSync={props.workspaceSync}
        onOpenSettingsPage={props.onOpenSyncSettingsPage}
      />
    </CompanionSettingsDetail>
  );
}

export function renderCompanionSettingsContent(props: CompanionSettingsContentProps) {
  return <SettingsTouchSurface><CompanionSettingsContentSurface {...props} /></SettingsTouchSurface>;
}
