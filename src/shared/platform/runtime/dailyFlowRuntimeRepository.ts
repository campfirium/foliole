import type { DailyFlowCommitArgs, DailyFlowOpenArgs } from '../../../../lib/core/flow/dailyFlowContract';
import { retainDailyFlowRetry, settleDailyFlowRetry } from '../../../../lib/core/flow/dailyFlowRetry';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';

export function hasDailyFlowRuntime() {
  return Boolean(getRuntimeInvoke());
}

export function openDailyFlowRuntime(args: DailyFlowOpenArgs) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.openDailyFlow, args);
}

export function commitDailyFlowRuntime(args: DailyFlowCommitArgs) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Daily Flow storage is unavailable.');
  return invoke(NATIVE_COMMANDS.commitDailyFlow, retainDailyFlowRetry(args)).then(result => {
    settleDailyFlowRetry(args.opId);
    return result;
  });
}
