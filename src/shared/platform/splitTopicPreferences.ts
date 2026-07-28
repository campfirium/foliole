import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeSplitTopicPreferences } from '../../../lib/platform/nativeSplitTopicPreferencesContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export const DEFAULT_SPLIT_TOPIC_PREFERENCES: NativeSplitTopicPreferences = {
  delimiter: '---',
  disposition: 'replace',
  keepDelimiter: false
};

export async function loadSplitTopicPreferences() {
  const invoke = getRuntimeInvoke();
  if (!invoke) return DEFAULT_SPLIT_TOPIC_PREFERENCES;
  return invoke(NATIVE_COMMANDS.loadSplitTopicPreferences);
}

export async function saveSplitTopicPreferences(preferences: NativeSplitTopicPreferences) {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('Split Topic preferences are unavailable');
  return invoke(NATIVE_COMMANDS.saveSplitTopicPreferences, preferences);
}
