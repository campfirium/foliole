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

function resolvePlaceholderTitle(title: string) {
  if (title === 'Device') return 'Device information';
  if (title === 'Appearance') return 'Display preferences';
  return 'Diagnostics';
}

function renderPlaceholderSettingsDetail(props: {
  detail: string;
  onBack: () => void;
  page: CompanionSettingsPage;
  title: string;
}) {
  return (
    <CompanionSettingsDetail onBack={props.onBack} page={props.page} title={props.title}>
      <CompanionPlaceholderSettingsContent
        detail={props.detail}
        title={resolvePlaceholderTitle(props.title)}
      />
    </CompanionSettingsDetail>
  );
}

export function renderCompanionSettingsContent(props: {
  onBackToSettingsList: () => void;
  onOpenSyncSettings: () => void;
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  settingsPage: CompanionSettingsPage;
  workspaceSync: WorkspaceSync;
}) {
  if (props.settingsPage === 'list') {
    return (
      <CompanionSettingsList
        onOpenAppearance={() => props.onOpenSyncSettingsPage('appearance')}
        onOpenDebug={() => props.onOpenSyncSettingsPage('debug')}
        onOpenDevice={() => props.onOpenSyncSettingsPage('device')}
        onOpenStorage={() => props.onOpenSyncSettingsPage('storage')}
        onOpenSync={props.onOpenSyncSettings}
      />
    );
  }
  if (props.settingsPage === 'storage') {
    return (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="storage" title="Storage">
        <CompanionStorageSettingsContent />
      </CompanionSettingsDetail>
    );
  }
  if (props.settingsPage === 'device') {
    return renderPlaceholderSettingsDetail({
      detail: 'Device information will appear here.',
      onBack: props.onBackToSettingsList,
      page: 'device',
      title: 'Device'
    });
  }
  if (props.settingsPage === 'appearance') {
    return renderPlaceholderSettingsDetail({
      detail: 'Display preferences will appear here.',
      onBack: props.onBackToSettingsList,
      page: 'appearance',
      title: 'Appearance'
    });
  }
  if (props.settingsPage === 'debug') {
    return renderPlaceholderSettingsDetail({
      detail: 'Diagnostics and development details will appear here.',
      onBack: props.onBackToSettingsList,
      page: 'debug',
      title: 'Debug'
    });
  }
  return (
    <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="sync" title="Device sync">
      <CompanionSyncContent
        page={props.settingsPage}
        workspaceSync={props.workspaceSync}
        onOpenSettingsPage={props.onOpenSyncSettingsPage}
      />
    </CompanionSettingsDetail>
  );
}
