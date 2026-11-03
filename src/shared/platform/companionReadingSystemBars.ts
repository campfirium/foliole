import { Capacitor, registerPlugin } from '@capacitor/core';

import { ReadingSystemBarOwner, type ReadingSystemBarTarget } from './readingSystemBarOwner';

interface ReadingSystemBarsHost {
  setReadingSystemBars(target: ReadingSystemBarTarget): Promise<void>;
}
const host = registerPlugin<ReadingSystemBarsHost>('FolioleCompanionBootstrap');

export function supportsCompanionReadingSystemBars() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export const companionReadingSystemBars = new ReadingSystemBarOwner(async target => {
  if (supportsCompanionReadingSystemBars()) await host.setReadingSystemBars(target);
});
