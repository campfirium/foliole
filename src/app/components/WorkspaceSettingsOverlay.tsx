import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function WorkspaceSettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <SettingsPanel
      hotkeyItems={props.hotkeyItems}
      onClose={props.onCloseSettings}
      onHotkeyReset={props.onHotkeyReset}
      onHotkeyResetAll={props.onHotkeyResetAll}
      onHotkeyUpdate={props.onHotkeyUpdate}
    />
  );
}
