import { Capacitor, SystemBars, SystemBarType } from '@capacitor/core';

import { ReadingSystemBarOwner } from './readingSystemBarOwner';

export function supportsCompanionReadingSystemBars() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export const companionReadingSystemBars = new ReadingSystemBarOwner(async hidden => {
  if (!supportsCompanionReadingSystemBars()) return;
  const options = { bar: SystemBarType.StatusBar };
  if (hidden) await SystemBars.hide(options);
  else await SystemBars.show(options);
});
