import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  archiveAssistantThreadIndex,
  deleteAssistantThreadIndex,
  listAssistantThreadIndex
} from '../database/assistantThreadIndex.js';
import { listAssistantThreadMessages } from '../database/assistantThreadMessages.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { readOpeningLocation, readProviderThreadId } from './assistantCommandInputs.js';

const LEGACY_ASSISTANT_DELETE_THREAD_INDEX_COMMAND = 'assistant_delete_thread_index';

export function handleAssistantLocalHistoryCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.assistantListThreadIndex) {
    const location = readOpeningLocation(args.location);
    return runWithDatabaseConnectionOwner(() => listAssistantThreadIndex({
      ...(args.includeArchived === true ? { includeArchived: true } : {}),
      ...(args.includeDeleted === true ? { includeDeleted: true } : {}),
      ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      ...(location ? { location } : {})
    }));
  }
  if (command === NATIVE_COMMANDS.assistantListThreadMessages) {
    return runWithDatabaseConnectionOwner(() => listAssistantThreadMessages(readProviderThreadId(args)));
  }
  if (command === NATIVE_COMMANDS.assistantArchiveThreadIndex) {
    return runWithDatabaseConnectionOwner(() => archiveAssistantThreadIndex(readProviderThreadId(args)));
  }
  if (command === NATIVE_COMMANDS.assistantRemoveThreadFromHistory ||
      command === LEGACY_ASSISTANT_DELETE_THREAD_INDEX_COMMAND) {
    return runWithDatabaseConnectionOwner(() => deleteAssistantThreadIndex(readProviderThreadId(args)));
  }
  return undefined;
}
