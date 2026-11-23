import type { ReactNode } from 'react';

import { AppDialogDescription, SettingsButton } from '../../../shared/ui';
import { settingsDialogPaneBody, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';

// Settings rows in the Aide dialog drop the main settings' tall minimum row height so each pane fits on one screen.
const AIDE_SETTINGS_PANE_BODY = `${settingsDialogPaneBody} py-5 [&_[data-settings-row]]:min-h-0 [&_[data-settings-row]]:py-2.5`;

// The pane name is already the selected item in the left navigation, so the header bar only holds Restore defaults.
export function AideSettingsPaneFrame({ children, description, onReset, resetLabel, showDescription = true }: {
  children: ReactNode;
  description: string;
  onReset?: (() => void) | undefined;
  resetLabel?: string | undefined;
  showDescription?: boolean;
}) {
  return (
    <>
      <div className={`${settingsDialogPaneHeader} justify-end gap-6`}>
        {onReset && resetLabel ? <SettingsButton onClick={onReset}>{resetLabel}</SettingsButton> : null}
      </div>
      <div className={AIDE_SETTINGS_PANE_BODY}>
        <AppDialogDescription
          className={showDescription ? 'mx-settings-panel-x mb-5 mt-0 max-w-[860px] text-ui-md leading-6 text-foreground/64' : 'sr-only'}
          id="aide-settings-description"
        >
          {description}
        </AppDialogDescription>
        {children}
      </div>
    </>
  );
}
