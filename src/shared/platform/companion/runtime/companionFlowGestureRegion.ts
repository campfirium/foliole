import { registerPlugin } from '@capacitor/core';

import type { NativeCompanionFlowGestureRegion } from '../../../../../lib/platform/nativeCompanionGestureContract';
import { getCompanionRuntimeCapability, requireCompanionNativePlugin } from '../../companionRuntimeCapabilities';

const plugin = registerPlugin<{ setFlowGestureRegion(args: NativeCompanionFlowGestureRegion): Promise<void> }>(
  'FolioleCompanionBootstrap');

export async function setCompanionFlowGestureRegion(args: NativeCompanionFlowGestureRegion) {
  if (getCompanionRuntimeCapability().kind !== 'android-native') return;
  requireCompanionNativePlugin('bootstrap', 'FolioleCompanionBootstrap');
  await plugin.setFlowGestureRegion(args);
}
