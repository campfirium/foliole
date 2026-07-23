import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeFoliolePublishConnectInput, NativeFoliolePublishDraftInput, NativeFoliolePublishSettings, NativeFoliolePublishTopicArgs } from '../../../lib/platform/nativeFoliolePublishContract';

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

export function loadFoliolePublishSiteTitleFromRuntime(): Promise<{ site_title: string } | null> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.loadFoliolePublishSiteTitle) : Promise.resolve(null);
}

export function saveFoliolePublishDraftToRuntime(settings: NativeFoliolePublishDraftInput) {
  return requireRuntime()(NATIVE_COMMANDS.saveFoliolePublishDraft, { settings });
}

export function saveFoliolePublishSiteTitleToRuntime(siteTitle: string) {
  return requireRuntime()(NATIVE_COMMANDS.saveFoliolePublishSiteTitle, { site_title: siteTitle });
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

export function viewFoliolePublishSiteFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.previewFoliolePublishSite);
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

export function loadFoliolePublishThemeFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.loadFoliolePublishTheme);
}

export function openFoliolePublishCustomThemeFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.openFoliolePublishCustomTheme);
}

export function useFoliolePublishThemeFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.useFoliolePublishTheme);
}

export function updateFoliolePublishLocalPagesFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.updateFoliolePublishLocalPages);
}

export function publishFoliolePublishThemeChangesFromRuntime() {
  return requireRuntime()(NATIVE_COMMANDS.publishFoliolePublishThemeChanges);
}

export function isFoliolePublishConfigured(settings: NativeFoliolePublishSettings | null) {
  return Boolean(settings?.account_id && settings.project_name && settings.pages_url && settings.has_credentials);
}
