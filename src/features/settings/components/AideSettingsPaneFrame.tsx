import type { ReactNode } from 'react';

import { AppDialogDescription } from '../../../shared/ui';
import { settingsDialogPaneBody, settingsDialogPaneHeader } from '../../../shared/ui/settingsDialogBounds';

// Settings rows in the Aide dialog drop the main settings' tall minimum row height so each pane fits on one screen.
const AIDE_SETTINGS_PANE_BODY = `${settingsDialogPaneBody} py-5 [&_[data-settings-row]]:min-h-0 [&_[data-settings-row]]:py-2.5`;

export function AideSettingsPaneFrame({ children, description, descriptionPosition = 'top' }: {
  children: ReactNode;
  description: string;
  descriptionPosition?: 'top' | 'bottom' | 'hidden';
}) {
  const descriptionSpacing = descriptionPosition === 'bottom' ? 'mb-0 mt-5' : 'mb-5 mt-0';
  const descriptionElement = (
    <AppDialogDescription
      className={descriptionPosition === 'hidden' ? 'sr-only' : `mx-settings-panel-x max-w-[860px] text-ui-md leading-6 text-foreground/64 ${descriptionSpacing}`}
      id="aide-settings-description"
    >
      {description}
    </AppDialogDescription>
  );
  return (
    <>
      <div aria-hidden="true" className={settingsDialogPaneHeader} />
      <div className={AIDE_SETTINGS_PANE_BODY}>
        {descriptionPosition !== 'bottom' ? descriptionElement : null}
        {children}
        {descriptionPosition === 'bottom' ? descriptionElement : null}
      </div>
    </>
  );
}
