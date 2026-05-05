import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import {
  createStartupBootSurfaceModel,
  createStartupErrorSurfaceModel,
  StartupSurface
} from '../shared/ui/StartupSurface';

import { CompanionShell } from './CompanionShell';
import { useCompanionBootstrap } from './useCompanionBootstrap';

const COMPANION_BOOT_MODEL = {
  ...createStartupBootSurfaceModel(),
  eyebrow: 'Companion runtime',
  message: 'Preparing a stable device identity and local companion storage before the topic surface loads.',
  title: 'Starting companion runtime'
};

function reloadCompanionRuntime() {
  window.location.reload();
}

export function CompanionApp() {
  const bootstrap = useCompanionBootstrap();

  const content = (() => {
    if (bootstrap.status === 'booting') {
      return <StartupSurface model={COMPANION_BOOT_MODEL} />;
    }

    if (bootstrap.status === 'failed') {
      return (
        <StartupSurface
          actions={[{ label: 'Retry', onClick: reloadCompanionRuntime, variant: 'primary' }]}
          model={createStartupErrorSurfaceModel({
            message: bootstrap.message,
            moduleLabel: 'Companion bootstrap',
            title: 'Companion bootstrap failed'
          })}
        />
      );
    }

    return <CompanionShell bootstrapState={bootstrap.state} />;
  })();

  return <MouseGestureSettingsProvider>{content}</MouseGestureSettingsProvider>;
}
