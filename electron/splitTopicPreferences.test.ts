// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  DEFAULT_SPLIT_TOPIC_PREFERENCES,
  loadSplitTopicPreferences,
  parseSplitTopicPreferences,
  saveSplitTopicPreferences
} from './splitTopicPreferences.js';

let userDataPath = '';

beforeEach(async () => {
  userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-split-topic-preferences-'));
});

afterEach(async () => {
  await fs.rm(userDataPath, { force: true, recursive: true });
});

it('accepts only complete V1 preference fields and ignores unknown fields', () => {
  expect(parseSplitTopicPreferences({ version: 1, delimiter: '-', disposition: 'keep-as-parent', keepDelimiter: true, unknown: 1 }))
    .toEqual({ delimiter: '-', disposition: 'keep-as-parent', keepDelimiter: true });
  expect(parseSplitTopicPreferences({ version: 2, delimiter: '-', disposition: 'replace', keepDelimiter: false })).toBeNull();
  expect(parseSplitTopicPreferences({ version: 1, delimiter: '', disposition: 'replace', keepDelimiter: false })).toBeNull();
  expect(parseSplitTopicPreferences({ version: 1, delimiter: 'x'.repeat(1025), disposition: 'replace', keepDelimiter: false })).toBeNull();
});

it('falls back without overwriting corrupt data, then atomically replaces it on save', async () => {
  const directory = path.join(userDataPath, 'feature-preferences');
  const target = path.join(directory, 'split-topic.json');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(target, '{broken', 'utf8');

  await expect(loadSplitTopicPreferences(userDataPath)).resolves.toEqual(DEFAULT_SPLIT_TOPIC_PREFERENCES);
  await expect(fs.readFile(target, 'utf8')).resolves.toBe('{broken');

  const saved = { delimiter: '***', disposition: 'keep-as-parent' as const, keepDelimiter: true };
  await expect(saveSplitTopicPreferences(userDataPath, saved)).resolves.toEqual(saved);
  await expect(loadSplitTopicPreferences(userDataPath)).resolves.toEqual(saved);
  expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
});

it('reads the same device preferences from a fresh service call', async () => {
  const saved = { delimiter: '===', disposition: 'replace' as const, keepDelimiter: false };
  await saveSplitTopicPreferences(userDataPath, saved);
  await expect(loadSplitTopicPreferences(userDataPath)).resolves.toEqual(saved);
  await expect(loadSplitTopicPreferences(userDataPath)).resolves.toEqual(saved);
});
