// @vitest-environment node

import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

it('freezes the accepted workgroup signature vector', async () => {
  const fixture = JSON.parse(await readFile(
    path.join(root, 'scripts/android/fixtures/android-pairing-signature-lifecycle.json'), 'utf8'
  ));
  const request = fixture.request;
  const canonical = [request.method.toUpperCase(), request.pathWithQuery, request.timestamp,
    request.nonce, request.bodyHash].join('\n');
  expect(createHmac('sha256', fixture.workgroupKey).update(canonical).digest('hex'))
    .toBe(fixture.expectedSignature);
});

it('uses only the current Sync Group data owner for production signing', async () => {
  const [credential, signing] = await Promise.all([
    readJava('FolioleCompanionCurrentGroupCredential.java'),
    readJava('FolioleCompanionSyncGroupSigning.java')
  ]);
  expect(credential).toContain('FolioleCompanionSyncGroupDataBridge.current().request(');
  expect(credential).toContain('"load_current_credential"');
  expect(signing).toContain('FolioleCompanionCurrentGroupCredential.load(groupId)');
  expect(signing).toContain('FolioleCompanionWorkgroupHttp.prepareWithKey(');
  for (const retired of ['FolioleCompanionPairingPluginActions.java',
    'FolioleCompanionSyncGroupOutboundPeerStore.java']) {
    expect(existsSync(path.join(javaRoot, retired))).toBe(false);
  }
});
