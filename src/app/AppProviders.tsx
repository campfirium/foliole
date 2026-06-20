import type { ReactNode } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { ExternalFoldersSettingsProvider } from '../features/settings/context/ExternalFoldersSettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../features/settings/context/WorkspaceRailSettingsProvider';
import type { AppLanguagePreference } from '../shared/localization/appLanguage';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { AppConfirmationProvider } from '../shared/ui';

interface AppProvidersProps {
  children: ReactNode;
  initialLanguagePreference?: AppLanguagePreference | undefined;
}

export function AppProviders({ children, initialLanguagePreference }: AppProvidersProps) {
  return (
    <LocalizationProvider initialLanguagePreference={initialLanguagePreference}>
      <AppearanceSettingsProvider>
        <ExternalFoldersSettingsProvider>
          <MouseGestureSettingsProvider>
            <ReviewSchedulerSettingsProvider>
              <WorkspaceRailSettingsProvider>
                <AppConfirmationProvider>{children}</AppConfirmationProvider>
              </WorkspaceRailSettingsProvider>
            </ReviewSchedulerSettingsProvider>
          </MouseGestureSettingsProvider>
        </ExternalFoldersSettingsProvider>
      </AppearanceSettingsProvider>
    </LocalizationProvider>
  );
}
