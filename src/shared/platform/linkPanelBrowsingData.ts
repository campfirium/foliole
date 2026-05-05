import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeClearLinkPanelBrowsingDataResult } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export type ClearLinkPanelBrowsingDataStatus = 'cleared' | 'unavailable';

export async function clearLinkPanelBrowsingData(): Promise<ClearLinkPanelBrowsingDataStatus> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return 'unavailable';
  }
  const result = await runtimeInvoke(
    NATIVE_COMMANDS.clearLinkPanelBrowsingData
  ) as NativeClearLinkPanelBrowsingDataResult;
  return result.status;
}
