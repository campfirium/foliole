import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  beginDiscourseUserApiAuthorization,
  completeDiscourseUserApiAuthorization,
  disconnectDiscoursePublishSettings,
  loadDiscoursePublishCatalog,
  loadDiscoursePublishDraft,
  loadDiscoursePublishSettings,
  publishTopicToDiscourse,
  saveDiscoursePublishDraft,
  saveDiscoursePublishSettings
} from '../discourse/discoursePublish.js';
import {
  connectFoliolePublishSettings,
  disconnectFoliolePublishSettings,
  loadFoliolePublishSettings,
  previewFoliolePublish,
  publishTopicToFoliole
} from '../foliolePublish/foliolePublish.js';
import {
  connectWordPressPublishSettings,
  disconnectWordPressPublishSettings,
  loadWordPressPublishSettings,
  publishTopicToWordPress
} from '../wordpress/wordpressPublish.js';

import { readSettingsObject } from './storageCommandSupport.js';

export async function handlePublishingStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadFoliolePublishSettings) return loadFoliolePublishSettings();
  if (command === NATIVE_COMMANDS.connectFoliolePublishSettings) {
    return connectFoliolePublishSettings(
      readSettingsObject(args.settings) as unknown as Parameters<typeof connectFoliolePublishSettings>[0]
    );
  }
  if (command === NATIVE_COMMANDS.disconnectFoliolePublishSettings) return disconnectFoliolePublishSettings();
  if (command === NATIVE_COMMANDS.previewFoliolePublish) return previewFoliolePublish();
  if (command === NATIVE_COMMANDS.publishTopicToFoliole) {
    return publishTopicToFoliole(readSettingsObject(args) as unknown as Parameters<typeof publishTopicToFoliole>[0]);
  }
  if (command === NATIVE_COMMANDS.loadDiscoursePublishSettings) return loadDiscoursePublishSettings();
  if (command === NATIVE_COMMANDS.loadDiscoursePublishCatalog) {
    return loadDiscoursePublishCatalog(readSettingsObject(args) as Parameters<typeof loadDiscoursePublishCatalog>[0]);
  }
  if (command === NATIVE_COMMANDS.loadDiscoursePublishDraft) {
    return loadDiscoursePublishDraft(String(args.node_id ?? ''));
  }
  if (command === NATIVE_COMMANDS.saveDiscoursePublishSettings) {
    return saveDiscoursePublishSettings(readSettingsObject(args.settings) as unknown as Parameters<typeof saveDiscoursePublishSettings>[0]);
  }
  if (command === NATIVE_COMMANDS.beginDiscourseUserApiAuthorization) {
    return beginDiscourseUserApiAuthorization(readSettingsObject(args) as Parameters<typeof beginDiscourseUserApiAuthorization>[0]);
  }
  if (command === NATIVE_COMMANDS.completeDiscourseUserApiAuthorization) {
    return completeDiscourseUserApiAuthorization(readSettingsObject(args) as Parameters<typeof completeDiscourseUserApiAuthorization>[0]);
  }
  if (command === NATIVE_COMMANDS.disconnectDiscoursePublishSettings) return disconnectDiscoursePublishSettings();
  if (command === NATIVE_COMMANDS.publishTopicToDiscourse) {
    return publishTopicToDiscourse(readSettingsObject(args) as unknown as Parameters<typeof publishTopicToDiscourse>[0]);
  }
  if (command === NATIVE_COMMANDS.saveDiscoursePublishDraft) {
    return saveDiscoursePublishDraft(readSettingsObject(args) as unknown as Parameters<typeof saveDiscoursePublishDraft>[0]);
  }
  if (command === NATIVE_COMMANDS.loadWordPressPublishSettings) return loadWordPressPublishSettings();
  if (command === NATIVE_COMMANDS.connectWordPressPublishSettings) {
    return connectWordPressPublishSettings(
      readSettingsObject(args.settings) as unknown as Parameters<typeof connectWordPressPublishSettings>[0]
    );
  }
  if (command === NATIVE_COMMANDS.disconnectWordPressPublishSettings) return disconnectWordPressPublishSettings();
  if (command === NATIVE_COMMANDS.publishTopicToWordPress) {
    return publishTopicToWordPress(readSettingsObject(args) as unknown as Parameters<typeof publishTopicToWordPress>[0]);
  }
  return undefined;
}
