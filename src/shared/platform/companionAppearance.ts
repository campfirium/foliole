import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';

import type { ResolvedBaseColorMode } from '../../features/settings/model/baseColorMode';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';

interface CompanionAppearancePlugin {
  setAppearance(options: { backgroundColor: string }): Promise<void>;
}

const bootstrap = registerPlugin<CompanionAppearancePlugin>('FolioleCompanionBootstrap');

export async function applyCompanionHostAppearance(mode: ResolvedBaseColorMode, backgroundColor: string) {
  const runtime = getCompanionRuntimeCapability();
  if (runtime.kind !== 'android-native' && runtime.kind !== 'ios-native') return;
  await SystemBars.setStyle({ style: mode === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  if (runtime.kind === 'android-native') await bootstrap.setAppearance({ backgroundColor });
}
