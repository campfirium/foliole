import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeWordPressConnectInput,
  NativeWordPressDraftInput,
  NativeWordPressPublishArgs,
  NativeWordPressPublishCatalog,
  NativeWordPressPublishResult,
  NativeWordPressPublishSettings
} from '../../../lib/platform/nativeWordPressPublishContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export async function loadWordPressPublishSettingsFromRuntime(): Promise<NativeWordPressPublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.loadWordPressPublishSettings) : null;
}

export async function saveWordPressPublishDraftToRuntime(
  settings: NativeWordPressDraftInput
): Promise<NativeWordPressPublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.saveWordPressPublishDraft, { settings }) : null;
}

export async function connectWordPressPublishSettingsToRuntime(
  settings: NativeWordPressConnectInput
): Promise<NativeWordPressPublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.connectWordPressPublishSettings, { settings }) : null;
}

export async function disconnectWordPressPublishSettingsFromRuntime(): Promise<NativeWordPressPublishSettings | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.disconnectWordPressPublishSettings) : null;
}

export async function loadWordPressPublishCatalogFromRuntime(
  args?: { post_id?: string }
): Promise<NativeWordPressPublishCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  return runtimeInvoke ? runtimeInvoke(NATIVE_COMMANDS.loadWordPressPublishCatalog, args) : null;
}

export async function publishTopicToWordPress(args: NativeWordPressPublishArgs): Promise<NativeWordPressPublishResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) throw new Error('Desktop runtime is required for WordPress publishing.');
  return runtimeInvoke(NATIVE_COMMANDS.publishTopicToWordPress, args);
}

export function isWordPressPublishConfigured(settings: NativeWordPressPublishSettings | null) {
  return Boolean(settings?.site_url && settings.has_credentials);
}
