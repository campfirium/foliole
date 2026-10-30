import { useEffect } from 'react';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { useAttachmentObservation } from '../shared/hooks/useAttachmentObservation';
import { LocalizationProvider, useTranslation } from '../shared/localization/LocalizationProvider';
import { useSystemEntryDisplayNamesSnapshot } from '../shared/localization/systemEntryDisplayNamesStore';
import { useCompanionForegroundTime } from '../shared/platform/companion/runtime/useCompanionForegroundTime';
import { AppConfirmationProvider } from '../shared/ui/AppConfirmationProvider';
import { StartupLoadingSurface } from '../shared/ui/StartupLoadingSurface';
import {
  createStartupErrorSurfaceModel,
  StartupSurface
} from '../shared/ui/StartupSurface';

import { CompanionColorModeProvider } from './CompanionColorModeProvider';
import { CompanionShell } from './CompanionShell';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';
import { useCompanionBootstrap } from './useCompanionBootstrap';

function reloadCompanionRuntime() {
  window.location.reload();
}

function CompanionAppContent() {
  useSystemEntryDisplayNamesSnapshot();
  const t = useTranslation();
  const bootstrap = useCompanionBootstrap();
  useAttachmentObservation(bootstrap.status === 'ready');
  useCompanionForegroundTime(bootstrap.status === 'ready');
  useEffect(() => {
    if (bootstrap.status === 'ready')
      void hydrateCompanionSystemEntryDisplayNames().catch(() => undefined);
  }, [bootstrap.status]);

  const content = (() => {
    if (bootstrap.status === 'booting') {
      return <StartupLoadingSurface title={t('shared.startup.bootTitle')} />;
    }

    if (bootstrap.status === 'failed') {
      return (
        <StartupSurface
          actions={[
            {
              label: t('companion.app.retry'),
              onClick: reloadCompanionRuntime,
              variant: 'emphasis'
            }
          ]}
          model={createStartupErrorSurfaceModel({
            message: bootstrap.message,
            moduleLabel: t('companion.app.bootstrap.module'),
            title: t('companion.app.bootstrapFailed')
          })}
        />
      );
    }

    return <CompanionShell bootstrapState={bootstrap.state} />;
  })();

  return <MouseGestureSettingsProvider>{content}</MouseGestureSettingsProvider>;
}

export function CompanionApp() {
  return (
    <LocalizationProvider>
      <CompanionColorModeProvider>
        <AppConfirmationProvider>
          <CompanionAppContent />
        </AppConfirmationProvider>
      </CompanionColorModeProvider>
    </LocalizationProvider>
  );
}
