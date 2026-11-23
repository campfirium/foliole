import {
  NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH,
  type NativeAssistantCustomInstructions
} from '../../lib/platform/nativeAssistantModelSettingsContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

export const FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY = 'foliole_aide_custom_instructions';

export function loadFolioleAideCustomInstructions(): NativeAssistantCustomInstructions {
  const value = loadJsonSetting(FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { text: '' };
  const text = (value as Record<string, unknown>).text;
  return { text: typeof text === 'string' ? text.slice(0, NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH) : '' };
}

export function saveFolioleAideCustomInstructions(text: string): NativeAssistantCustomInstructions {
  if (text.length > NATIVE_ASSISTANT_CUSTOM_INSTRUCTIONS_MAX_LENGTH) throw new Error('invalid_custom_instructions');
  saveJsonSetting(FOLIOLE_AIDE_CUSTOM_INSTRUCTIONS_KEY, { text, version: 1 });
  return { text };
}
