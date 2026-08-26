/* global process */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();

it('lands every shared sync trigger reason in the iOS native runtime', async () => {
  const plugin = await readFile(path.join(ROOT, 'ios/App/App/FolioleCompanionSyncPlugin.swift'), 'utf8');
  const trigger = await readFile(path.join(ROOT, 'ios/App/App/FolioleCompanionSyncTrigger.swift'), 'utf8');

  expect(plugin).toContain('CAPPluginMethod(name: "beginSyncRun"');
  expect(trigger).toContain('["initial", "automatic", "manual"].contains(reason)');
  expect(trigger).toContain('"runtime": "ios"');
  expect(trigger).toContain('call.reject("Sync command is unavailable.")');
});
