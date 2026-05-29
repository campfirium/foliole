import { CompanionSettingsDetail, CompanionSettingsList } from './CompanionSettingsContent';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';
import { CompanionSyncContent } from './CompanionSyncContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type WorkspaceSync = ReturnType<typeof useCompanionWorkspaceSync>;

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
