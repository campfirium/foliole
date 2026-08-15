import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';

import { useOptionalCompanionCustomCss } from './CompanionCustomCssProvider';
import { CompanionCustomCssSettingsContent } from './CompanionCustomCssSettingsContent';
import {
  CompanionPlaceholderSettingsContent,
  CompanionSettingsDetail,
  CompanionSettingsList
} from './CompanionSettingsContent';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
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
  if (customCss?.isSupported) {
    return (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="appearance" title={t('companion.settings.appearance.title')}>
        <CompanionCustomCssSettingsContent />
      </CompanionSettingsDetail>
    );
  }
  return renderPlaceholderSettingsDetail({
    detail: t('companion.settings.appearance.placeholderDetail'),
    onBack: props.onBackToSettingsList,
    page: 'appearance',
    placeholderTitle: resolvePlaceholderTitle('appearance', t),
    title: t('companion.settings.appearance.title')
  });
}

function CompanionSettingsContentSurface(props: CompanionSettingsContentProps) {
  const t = useTranslation();
  const showStorage = supportsCompanionAppDataClear();
  if (props.settingsPage === 'list' || (props.settingsPage === 'storage' && !showStorage)) {
    return (
      <CompanionSettingsList
        onOpenAppearance={() => props.onOpenSyncSettingsPage('appearance')}
        onOpenDebug={() => props.onOpenSyncSettingsPage('debug')}
        onOpenStorage={() => props.onOpenSyncSettingsPage('storage')}
        onOpenSync={props.onOpenSyncSettings}
        showStorage={showStorage}
      />
    );
  }
  if (props.settingsPage === 'storage') {
    return (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="storage" title={t('companion.settings.storage.title')}>
        <CompanionStorageSettingsContent />
      </CompanionSettingsDetail>
    );
  }
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
    return renderPlaceholderSettingsDetail({
      detail: t('companion.settings.debug.detail'),
      onBack: props.onBackToSettingsList,
      page: 'debug',
      placeholderTitle: resolvePlaceholderTitle('debug', t),
      title: t('companion.settings.debug.title')
    });
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
  return <CompanionSettingsContentSurface {...props} />;
}
