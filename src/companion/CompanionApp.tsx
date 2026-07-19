import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider, useTranslation } from '../shared/localization/LocalizationProvider';
import {
  createStartupBootSurfaceModel,
  createStartupErrorSurfaceModel,
  StartupSurface
} from '../shared/ui/StartupSurface';

import { CompanionShell } from './CompanionShell';
import { useCompanionBootstrap } from './useCompanionBootstrap';

function reloadCompanionRuntime() {
  window.location.reload();
}

function CompanionAppContent() {
  const t = useTranslation();
  const bootstrap = useCompanionBootstrap();
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
          actions={[{ label: t('companion.app.retry'), onClick: reloadCompanionRuntime, variant: 'emphasis' }]}
          model={createStartupErrorSurfaceModel({
            message: bootstrap.message,
            moduleLabel: t('companion.app.bootstrap.module'),
            title: t('companion.app.bootstrapFailed')
          })}
        />
      );
    }

    if (bootstrap.state.runtime_kind === 'ios-capacitor') {
      return (
        <StartupSurface model={{
          eyebrow: t('companion.app.iosPrepared.eyebrow'),
          message: t('companion.app.iosPrepared.message'),
          title: t('companion.app.iosPrepared.title')
        }} />
      );
    }

    return <CompanionShell bootstrapState={bootstrap.state} />;
  })();

  return <MouseGestureSettingsProvider>{content}</MouseGestureSettingsProvider>;
}

export function CompanionApp() {
  return <LocalizationProvider><CompanionAppContent /></LocalizationProvider>;
}
