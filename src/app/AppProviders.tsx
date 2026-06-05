import type { ReactNode } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../features/settings/context/WorkspaceRailSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { AppConfirmationProvider } from '../shared/ui';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocalizationProvider>
      <AppearanceSettingsProvider>
        <MouseGestureSettingsProvider>
          <ReviewSchedulerSettingsProvider>
            <WorkspaceRailSettingsProvider>
              <AppConfirmationProvider>{children}</AppConfirmationProvider>
            </WorkspaceRailSettingsProvider>
          </ReviewSchedulerSettingsProvider>
        </MouseGestureSettingsProvider>
      </AppearanceSettingsProvider>
    </LocalizationProvider>
  );
}
