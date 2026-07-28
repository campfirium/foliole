import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeSplitTopicPreferences } from '../lib/platform/nativeSplitTopicPreferencesContract.js';

const CONFIG_VERSION = 1;
const CONFIG_DIRECTORY = 'feature-preferences';
const CONFIG_FILE = 'split-topic.json';

export const DEFAULT_SPLIT_TOPIC_PREFERENCES: NativeSplitTopicPreferences = {
  delimiter: '---',
  disposition: 'replace',
  keepDelimiter: false
};

export function parseSplitTopicPreferences(value: unknown): NativeSplitTopicPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== CONFIG_VERSION) return null;
  if (raw.disposition !== 'replace' && raw.disposition !== 'keep-as-parent') return null;
  if (typeof raw.delimiter !== 'string' || raw.delimiter.length < 1 || raw.delimiter.length > 1024) return null;
  if (typeof raw.keepDelimiter !== 'boolean') return null;
  return {
    delimiter: raw.delimiter,
    disposition: raw.disposition,
    keepDelimiter: raw.keepDelimiter
  };
}

function configPath(userDataPath: string) {
  return path.join(userDataPath, CONFIG_DIRECTORY, CONFIG_FILE);
}

export async function loadSplitTopicPreferences(userDataPath: string) {
  try {
    const parsed = parseSplitTopicPreferences(JSON.parse(await fs.readFile(configPath(userDataPath), 'utf8')));
    return parsed ?? DEFAULT_SPLIT_TOPIC_PREFERENCES;
  } catch {
    return DEFAULT_SPLIT_TOPIC_PREFERENCES;
  }
}

export async function saveSplitTopicPreferences(userDataPath: string, preferences: NativeSplitTopicPreferences) {
  const validated = parseSplitTopicPreferences({ version: CONFIG_VERSION, ...preferences });
  if (!validated) throw new Error('invalid Split Topic preferences');
  const target = configPath(userDataPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${CONFIG_FILE}.${process.pid}.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, `${JSON.stringify({ version: CONFIG_VERSION, ...validated }, null, 2)}\n`, 'utf8');
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return validated;
}
