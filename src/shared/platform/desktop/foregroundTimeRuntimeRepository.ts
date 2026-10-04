import { readForegroundTimeHistory } from '../../../../lib/core/database/foregroundTimeHistory';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { ForegroundTimeHistoryArgs } from '../../../../lib/platform/nativeForegroundTimeContract';
import { getCurrentReviewSchedulerSettings } from '../../../features/settings/model/reviewSchedulerSettings';
import { companionForegroundTimeSnapshot, companionForegroundTimeFailure } from '../companion/runtime/companionForegroundTime';
import { readIosCompanionDatabase } from '../companion/runtime/iosCompanionActiveDatabase';
import { isNativeCompanionRuntime } from '../companionBootstrap';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadForegroundTimeHistoryFromRuntime(args: ForegroundTimeHistoryArgs) {
  const invoke = getRuntimeInvoke();
  if (invoke) return invoke(NATIVE_COMMANDS.loadForegroundTimeHistory, args);
  if (!isNativeCompanionRuntime()) throw new Error('Foreground time requires a library runtime');
  if (companionForegroundTimeFailure()) throw new Error('Foreground time could not be saved');
  return readIosCompanionDatabase((db) => readForegroundTimeHistory(db, args,
    getCurrentReviewSchedulerSettings().newDayStartsAtHour, companionForegroundTimeSnapshot()));
}
