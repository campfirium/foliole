import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { StartupLoadingSurface } from '../shared/ui/StartupLoadingSurface';
import { createStartupErrorSurfaceModel, StartupSurface } from '../shared/ui/StartupSurface';

import { useCompanionLibrarySwitch } from './companionLibrarySwitch';

/** Replaces the shell while a restored or previous library is being swapped in. */
export function CompanionLibrarySwitchGate({ children, onReopen }: { children: ReactNode; onReopen(): void }) {
  const t = useTranslation();
  const librarySwitch = useCompanionLibrarySwitch();
  if (librarySwitch.step === 'switching') return <StartupLoadingSurface title={t('companion.app.switchingLibrary')} />;
  if (librarySwitch.step === 'failed') {
    return <StartupSurface
      actions={[{ label: t('companion.settings.storage.restoreReopen'), onClick: onReopen, variant: 'emphasis' }]}
      model={createStartupErrorSurfaceModel({ message: librarySwitch.message, title: t('companion.app.switchFailed') })} />;
  }
  return <>{children}</>;
}
