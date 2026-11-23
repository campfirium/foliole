import type { ReactNode } from 'react';

import { AppDialogDescription, SettingsButton } from '../../../shared/ui';
import { settingsDialogPaneBody, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';

// Settings rows in the Aide dialog drop the main settings' tall minimum row height so each pane fits on one screen.
const AIDE_SETTINGS_PANE_BODY = `${settingsDialogPaneBody} py-5 [&_[data-settings-row]]:min-h-0 [&_[data-settings-row]]:py-2.5`;

export function AideSettingsPaneFrame({ children, description, onReset, resetLabel, title }: {
  children: ReactNode;
  description: string;
  onReset?: (() => void) | undefined;
  resetLabel?: string | undefined;
  title: string;
}) {
  return (
    <>
      <div className={`${settingsDialogPaneHeader} justify-between gap-6`}>
        <h2 className="m-0 text-ui-md font-semibold text-foreground">{title}</h2>
        {onReset && resetLabel ? <SettingsButton onClick={onReset}>{resetLabel}</SettingsButton> : null}
      </div>
      <div className={AIDE_SETTINGS_PANE_BODY}>
        <AppDialogDescription className="mx-settings-panel-x mb-5 mt-0 max-w-[860px] text-ui-md leading-6 text-foreground/64" id="aide-settings-description">
          {description}
        </AppDialogDescription>
        {children}
      </div>
    </>
  );
}
