import { useEffect } from 'react';

import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider, useTranslation } from '../shared/localization/LocalizationProvider';
import { useSystemEntryDisplayNamesSnapshot } from '../shared/localization/systemEntryDisplayNamesStore';
import {
  createStartupBootSurfaceModel,
  createStartupErrorSurfaceModel,
  StartupSurface
} from '../shared/ui/StartupSurface';

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
  useEffect(() => {
    if (bootstrap.status === 'ready')
      void hydrateCompanionSystemEntryDisplayNames().catch(() => undefined);
  }, [bootstrap.status]);
  const bootModel = {
    ...createStartupBootSurfaceModel(),
    eyebrow: t('companion.app.starting.eyebrow'),
    message: t('companion.app.starting.message'),
    title: t('companion.app.starting.title')
  };

  const content = (() => {
    if (bootstrap.status === 'booting') {
      return <StartupSurface model={bootModel} />;
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
      <CompanionAppContent />
    </LocalizationProvider>
  );
}
