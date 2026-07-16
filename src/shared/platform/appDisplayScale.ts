import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export async function applyAppDisplayScalePercent(percent: number) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return;
  await invoke(NATIVE_COMMANDS.setAppDisplayScale, { percent });
}
