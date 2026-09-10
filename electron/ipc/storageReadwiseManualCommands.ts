import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { importReadwiseManualSource } from '../import/readwiseManualImport.js';
import { prepareReadwiseManualSearch, searchReadwiseManualSources } from '../import/readwiseManualSearch.js';

import { asBoolean, asString } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export async function handleReadwiseManualCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.prepareReadwiseManualSearch) return prepareReadwiseManualSearch();
  if (command === NATIVE_COMMANDS.searchReadwiseManualSources) {
    return searchReadwiseManualSources(asString(args.query, 'query'));
  }
  if (command !== NATIVE_COMMANDS.importReadwiseManualSource) return undefined;
  const result = await importReadwiseManualSource(asString(args.id, 'id'), asBoolean(args.reimport, 'reimport'));
  if (result.status === 'imported') notifyWorkspaceContentChanged();
  return result;
}
