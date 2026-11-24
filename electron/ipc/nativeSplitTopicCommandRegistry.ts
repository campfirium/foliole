import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

export const NATIVE_SPLIT_TOPIC_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.loadSplitTopicPreferences, route: 'windowAndUtility', capability: 'read' },
  { command: NATIVE_COMMANDS.loadSplitTopicPreview, route: 'storage', capability: 'read' },
  { command: NATIVE_COMMANDS.saveSplitTopicPreferences, route: 'windowAndUtility', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.splitTopic, route: 'storage', capability: 'destructiveMutation' },
] as const;
