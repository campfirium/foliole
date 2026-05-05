import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function WorkspaceSettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isSettingsOpen) {
    return null;
  }

  return (
    <SettingsPanel
      onClose={props.onCloseSettings}
    />
  );
}
