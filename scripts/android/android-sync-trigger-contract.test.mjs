/* global process */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();

it('lands every shared sync trigger reason in the Android native runtime', async () => {
  const plugin = await readFile(path.join(
    ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java'
  ), 'utf8');
  const trigger = await readFile(path.join(
    ROOT, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncTrigger.java'
  ), 'utf8');

  expect(plugin).toMatch(/@PluginMethod public void beginSyncRun\(PluginCall call\)/);
  expect(trigger).toContain('reason.equals("initial")');
  expect(trigger).toContain('reason.equals("automatic")');
  expect(trigger).toContain('reason.equals("manual")');
  expect(trigger).toContain('.put("runtime", "android")');
});
