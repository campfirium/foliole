import { app } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeSplitTopicPreferences } from '../../lib/platform/nativeSplitTopicPreferencesContract.js';
import { loadSplitTopicPreferences, saveSplitTopicPreferences } from '../splitTopicPreferences.js';

import type { InvokeRequest } from './contracts.js';

function parseSaveArgs(value: unknown): NativeSplitTopicPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid Split Topic preferences');
  const raw = value as Record<string, unknown>;
  if (raw.disposition !== 'replace' && raw.disposition !== 'keep-as-parent') throw new Error('invalid argument: disposition');
  if (typeof raw.delimiter !== 'string' || raw.delimiter.length < 1 || raw.delimiter.length > 1024) {
    throw new Error('invalid argument: delimiter');
  }
  if (typeof raw.keepDelimiter !== 'boolean') throw new Error('invalid argument: keepDelimiter');
  return { delimiter: raw.delimiter, disposition: raw.disposition, keepDelimiter: raw.keepDelimiter };
}

export function handleSplitTopicPreferencesCommand(request: InvokeRequest) {
  if (request.command === NATIVE_COMMANDS.loadSplitTopicPreferences) {
    return loadSplitTopicPreferences(app.getPath('userData'));
  }
  if (request.command === NATIVE_COMMANDS.saveSplitTopicPreferences) {
    return saveSplitTopicPreferences(app.getPath('userData'), parseSaveArgs(request.args));
  }
  return undefined;
}
