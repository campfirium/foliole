// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

it('keeps legacy admission registered while inactive v4 denies ordinary providers without polling', async () => {
  const [plugin, provider, server, admission, rows] = await Promise.all([
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupServer.java'),
    source('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupAdmissionAdapter.java'),
    source('src/companion/CompanionSyncGroupRows.tsx')
  ]);
  expect(server).toContain('admission.handleLegacy(request, output, remoteAddress)');
  expect(server).not.toContain('/companion/v4');
  expect(admission).toContain('FolioleCompanionSyncGroupProvider.notifyStateChanged();');
  expect(admission).toContain('"manager_required"');
  expect(admission).toContain('inactiveV4Admission');
  expect(provider).toContain('static void notifyStateChanged()');
  expect(plugin).toContain('syncGroupProviderStateEvent');
  expect(plugin).toContain('notifyListeners(name, event)');
  expect(rows).toContain('<CompanionSyncGroupJoinApproval provider={provider} />');
  expect(`${server}\n${admission}\n${rows}`).not.toContain('setInterval');
});
