import type { ComponentProps } from 'react';

import { CompanionSyncInlineStatus } from './CompanionSyncInlineStatus';
import { CompanionTopBar } from './CompanionTopBar';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

export function CompanionShellTopBar(props: {
  onOpenSyncSettings(): void;
  topBarProps: Omit<ComponentProps<typeof CompanionTopBar>, 'statusSlot' | 'visible'>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  return (
    <CompanionTopBar
      {...props.topBarProps}
      statusSlot={(
        <CompanionSyncInlineStatus
          onOpenSyncSettings={props.onOpenSyncSettings}
          workspaceSync={props.workspaceSync}
        />
      )}
      visible
    />
  );
}
