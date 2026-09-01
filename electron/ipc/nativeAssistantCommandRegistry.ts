import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import type { NativeCommandRegistryEntry } from './nativeCommandRegistry.js';

export const NATIVE_ASSISTANT_COMMAND_REGISTRY = [
  { command: NATIVE_COMMANDS.assistantGetStatus, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantListModels, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantStartChatGptLogin, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantSendMessage, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantListThreadIndex, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantListThreadMessages, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantReadImageAttachment, route: 'assistant', capability: 'read' },
  { command: NATIVE_COMMANDS.assistantArchiveThreadIndex, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantRemoveThreadFromHistory, route: 'assistant', capability: 'assistant' },
  { command: NATIVE_COMMANDS.assistantGetStorageInfo, route: 'assistant', capability: 'read' },
  { command: NATIVE_COMMANDS.assistantOpenStorageLocation, route: 'assistant', capability: 'filesystemOpen' },
  { command: NATIVE_COMMANDS.assistantLoadByokSettings, route: 'assistant', capability: 'read' },
  { command: NATIVE_COMMANDS.assistantSaveByokSettings, route: 'assistant', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.assistantSetProvider, route: 'assistant', capability: 'settingsMutation' },
  { command: NATIVE_COMMANDS.assistantDisconnectByokSettings, route: 'assistant', capability: 'settingsMutation' }
] as const satisfies readonly NativeCommandRegistryEntry[];
