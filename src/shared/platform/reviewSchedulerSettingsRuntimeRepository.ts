import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

export function hasReviewSchedulerSettingsRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function loadReviewSchedulerSettingsFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadReviewSchedulerSettings);
}

export async function saveReviewSchedulerSettingsToRuntime(settings: unknown): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.saveReviewSchedulerSettings, { settings });
}
