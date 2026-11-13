import { App } from '@capacitor/app';

import { getCompanionRuntimeCapability, isCompanionNativeHost } from '../../companionRuntimeCapabilities';

export async function loadInstalledCompanionVersion() {
  if (!isCompanionNativeHost(getCompanionRuntimeCapability())) return null;

  const { version, build } = await App.getInfo();
  return version && build ? { version, build } : null;
}
