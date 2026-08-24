// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

it('projects join requests to the public companion surface without polling', async () => {
  const [plugin, provider, server, rows] = await Promise.all([
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java'),
    source('src/companion/CompanionSyncGroupRows.tsx')
  ]);
  expect(server).toContain('FolioleCompanionSyncGroupProvider.notifyStateChanged();');
  expect(provider).toContain('static void notifyStateChanged()');
  expect(plugin).toContain('syncGroupProviderStateEvent');
  expect(plugin).toContain('notifyListeners(name, event)');
  expect(rows).toContain('<CompanionSyncGroupJoinApproval provider={provider} />');
  expect(rows).not.toContain('setInterval');
});
