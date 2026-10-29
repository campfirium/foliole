import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReviewCalendarArgs } from '../../../../lib/platform/nativeReviewCalendarContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadReviewCalendarHistoryFromRuntime(args: NativeReviewCalendarArgs) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Review calendar requires the library runtime');
  return invoke(NATIVE_COMMANDS.loadReviewCalendarHistory, args);
}
