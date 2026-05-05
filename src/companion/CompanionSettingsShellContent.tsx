import { CompanionSettingsDetail, CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
import type { CompanionTabConfig } from './CompanionTabsConfig';
import { CompanionTabsSettingsContent } from './CompanionTabsSettingsContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

export function renderCompanionSettingsContent(props: {
  companionTabConfig: CompanionTabConfig;
  onBackToSettingsList: () => void;
  onCompanionTabConfigChange: (config: CompanionTabConfig) => void;
  onOpenSyncSettings: () => void;
  onOpenSyncSettingsPage: (page: CompanionSettingsPage) => void;
  onOpenTabsSettings: () => void;
  settingsPage: CompanionSettingsPage;
  workspaceSync: WorkspaceSync;
}) {
  if (props.settingsPage === 'list') {
    return (
      <CompanionSettingsList
        onOpenStorage={() => props.onOpenSyncSettingsPage('storage')}
        onOpenSync={props.onOpenSyncSettings}
        onOpenTabs={props.onOpenTabsSettings}
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
  if (props.settingsPage === 'tabs') {
    return (
      <CompanionSettingsDetail onBack={props.onBackToSettingsList} page="tabs" title="Tabs">
        <CompanionTabsSettingsContent
          config={props.companionTabConfig}
          onConfigChange={props.onCompanionTabConfigChange}
        />
      </CompanionSettingsDetail>
    );
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
