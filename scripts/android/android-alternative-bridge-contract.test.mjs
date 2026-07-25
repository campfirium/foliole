import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('keeps the companion alternate-text repository wired to a registered Android Capacitor plugin', async () => {
  const [repository, plugin, activity] = await Promise.all([
    readFile(path.join(process.cwd(), 'src/shared/platform/companionNodeTextAlternativeRepository.ts'), 'utf8'),
    readFile(path.join(process.cwd(), 'android/app/src/main/java/com/foliole/android/FolioleCompanionAlternativePlugin.java'), 'utf8'),
    readFile(path.join(process.cwd(), 'android/app/src/main/java/com/foliole/android/MainActivity.java'), 'utf8')
  ]);

  expect(repository).toContain("registerPlugin<CompanionAlternativePlugin>('FolioleCompanionAlternative')");
  expect(repository).toContain('AlternativePlugin.load({ node_id: nodeId })');
  expect(repository).toContain('AlternativePlugin.updateStatus({');
  expect(plugin).toContain('@CapacitorPlugin(name = "FolioleCompanionAlternative")');
  expect(plugin).toContain('public void load(PluginCall call)');
  expect(plugin).toContain('public void updateStatus(PluginCall call)');
  expect(activity).toContain('registerPlugin(FolioleCompanionAlternativePlugin.class)');
});
