import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeDiscoursePublishArgs,
  NativeDiscoursePublishCatalog,
  NativeDiscoursePublishResult,
  NativeDiscoursePublishSettings,
  NativeDiscoursePublishSettingsInput
} from '../../../lib/platform/nativeDiscoursePublishContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export async function loadDiscoursePublishSettingsFromRuntime(): Promise<NativeDiscoursePublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return runtimeInvoke(NATIVE_COMMANDS.loadDiscoursePublishSettings);
}

export async function saveDiscoursePublishSettingsToRuntime(
  settings: NativeDiscoursePublishSettingsInput
): Promise<NativeDiscoursePublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return runtimeInvoke(NATIVE_COMMANDS.saveDiscoursePublishSettings, { settings });
}

export async function disconnectDiscoursePublishSettingsFromRuntime(): Promise<NativeDiscoursePublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return runtimeInvoke(NATIVE_COMMANDS.disconnectDiscoursePublishSettings);
}

export async function loadDiscoursePublishCatalogFromRuntime(input?: { refresh?: boolean }): Promise<NativeDiscoursePublishCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  return (input
    ? await runtimeInvoke(NATIVE_COMMANDS.loadDiscoursePublishCatalog, input)
    : await runtimeInvoke(NATIVE_COMMANDS.loadDiscoursePublishCatalog)) as NativeDiscoursePublishCatalog;
}

export async function publishTopicToDiscourse(args: NativeDiscoursePublishArgs): Promise<NativeDiscoursePublishResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('Desktop runtime is required for Discourse publishing.');
  }
  return runtimeInvoke(NATIVE_COMMANDS.publishTopicToDiscourse, args);
}

export function isDiscoursePublishConfigured(settings: NativeDiscoursePublishSettings | null) {
  return Boolean(settings?.site_url && settings.has_api_key);
}
