// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { loadSplitTopicPreferences, saveSplitTopicPreferences } from '../splitTopicPreferences.js';

import { handleSplitTopicPreferencesCommand } from './splitTopicPreferencesCommands.js';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/device-user-data') } }));
vi.mock('../splitTopicPreferences.js', () => ({
  loadSplitTopicPreferences: vi.fn(),
  saveSplitTopicPreferences: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

it('loads preferences from main-process userData', async () => {
  const preferences = { delimiter: '---', disposition: 'replace' as const, keepDelimiter: false };
  vi.mocked(loadSplitTopicPreferences).mockResolvedValue(preferences);
  await expect(handleSplitTopicPreferencesCommand({ command: 'load_split_topic_preferences' })).resolves.toEqual(preferences);
  expect(loadSplitTopicPreferences).toHaveBeenCalledWith('/device-user-data');
});

it('validates and saves only the narrow preference payload', async () => {
  const preferences = { delimiter: '***', disposition: 'keep-as-parent' as const, keepDelimiter: true };
  vi.mocked(saveSplitTopicPreferences).mockResolvedValue(preferences);
  await expect(handleSplitTopicPreferencesCommand({ command: 'save_split_topic_preferences', args: preferences })).resolves.toEqual(preferences);
  expect(saveSplitTopicPreferences).toHaveBeenCalledWith('/device-user-data', preferences);

  expect(() => handleSplitTopicPreferencesCommand({
    command: 'save_split_topic_preferences',
    args: { ...preferences, delimiter: '' }
  })).toThrow('invalid argument: delimiter');
});
