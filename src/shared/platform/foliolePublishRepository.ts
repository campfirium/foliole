import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeFoliolePublishConnectInput, NativeFoliolePublishSettings, NativeFoliolePublishTopicArgs } from '../../../lib/platform/nativeFoliolePublishContract';

import { getRuntimeInvoke } from './runtimeInvoke';

function requireRuntime() {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Desktop runtime is required for Foliole Publish.');
  return invoke;
}

export function loadFoliolePublishSettingsFromRuntime(): Promise<NativeFoliolePublishSettings | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadFoliolePublishSettings) : Promise.resolve(null);
}

export function connectFoliolePublishSettingsToRuntime(settings: NativeFoliolePublishConnectInput) {
  return requireRuntime()(NATIVE_COMMANDS.connectFoliolePublishSettings, { settings });
}

export function updateFoliolePublishSiteAddressInRuntime(siteAddress: string) {
  return requireRuntime()(NATIVE_COMMANDS.updateFoliolePublishSiteAddress, { site_address: siteAddress });
}

export function disconnectFoliolePublishSettingsFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.disconnectFoliolePublishSettings);
}

export function previewFoliolePublishFromRuntime(args: NativeFoliolePublishTopicArgs) {
  return requireRuntime()(NATIVE_COMMANDS.previewFoliolePublish, args);
}

export function publishTopicToFoliole(args: NativeFoliolePublishTopicArgs) {
  return requireRuntime()(NATIVE_COMMANDS.publishTopicToFoliole, args);
}

export function forgetFoliolePublishFieldFromRuntime(key: string) {
  return requireRuntime()(NATIVE_COMMANDS.forgetFoliolePublishField, { key });
}

export function resetFoliolePublishFieldHistoryFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.resetFoliolePublishFieldHistory);
}

export function openFoliolePublishThemeFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.openFoliolePublishTheme);
}

export function resetFoliolePublishThemeFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.resetFoliolePublishTheme);
}

export function isFoliolePublishConfigured(settings: NativeFoliolePublishSettings | null) {
  return Boolean(settings?.account_id && settings.project_name && settings.has_credentials);
}
