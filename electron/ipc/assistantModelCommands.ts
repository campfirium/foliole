import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  deleteFolioleAideModel,
  loadFolioleAideModelSettings,
  saveFolioleAideModelDraft,
  selectFolioleAideModel,
  testAndSaveFolioleAideModel
} from '../assistant/folioleAideModelSettings.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

export function handleAssistantModelCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.assistantLoadModelSettings) {
    return runWithDatabaseConnectionOwner(loadFolioleAideModelSettings);
  }
  if (command === NATIVE_COMMANDS.assistantSaveModelDraft) {
    return runWithDatabaseConnectionOwner(() => saveFolioleAideModelDraft(readRequiredModelInput(args)));
  }
  if (command === NATIVE_COMMANDS.assistantTestModel) {
    return testAndSaveFolioleAideModel(readModelInput(args));
  }
  if (command === NATIVE_COMMANDS.assistantDeleteModel) {
    return runWithDatabaseConnectionOwner(() => deleteFolioleAideModel(readId(args.id)));
  }
  if (command === NATIVE_COMMANDS.assistantSelectModel) {
    return runWithDatabaseConnectionOwner(() => selectFolioleAideModel(readId(args.id)));
  }
  return undefined;
}

function readModelInput(args: Record<string, unknown>) {
  if (typeof args.endpoint !== 'string' || typeof args.model !== 'string') {
    throw new Error('invalid_byok_settings');
  }
  if (args.api_key !== undefined && typeof args.api_key !== 'string') {
    throw new Error('invalid_byok_settings');
  }
  return {
    endpoint: args.endpoint,
    model: args.model,
    ...(typeof args.api_key === 'string' ? { api_key: args.api_key } : {}),
    ...(args.id === undefined ? {} : { id: readId(args.id) })
  };
}

function readRequiredModelInput(args: Record<string, unknown>) {
  const input = readModelInput(args);
  if (!input.id) throw new Error('invalid_assistant_model_id');
  return { ...input, id: input.id };
}

function readId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid_assistant_model_id');
  return value.trim();
}
