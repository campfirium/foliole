// @vitest-environment node

import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const javaRoot = path.join(root, 'android/app/src/main/java/com/foliole/android');
const fixturePath = path.join(
  root, 'scripts/android/fixtures/android-pairing-signature-lifecycle.json'
);

const readJava = (name) => readFile(path.join(javaRoot, name), 'utf8');

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

function canonical(request) {
  return [
    request.method.toUpperCase(), request.pathWithQuery, request.timestamp,
    request.nonce, request.bodyHash
  ].join('\n');
}

it('freezes the fresh-join signature vector before the provider cutover', async () => {
  const fixture = await loadFixture();
  const signature = createHmac('sha256', fixture.workgroupKey)
    .update(canonical(fixture.request))
    .digest('hex');

  expect(signature).toBe(fixture.expectedSignature);
  expect(fixture.activeGroup).toEqual(expect.objectContaining({
    endpointUrl: expect.stringMatching(/^http:\/\//u),
    groupId: expect.stringMatching(/^group-/u),
    localAuthorizationId: expect.stringMatching(/^authorization-/u)
  }));
  expect(fixture.negativeCases).toEqual([
    'missing_workgroup_key',
    'sync_group_peer_not_found',
    'sync_group_peer_ambiguous',
    'sync_group_peer_mismatch'
  ]);
});

it('keeps explicit-key signing independent from WorkgroupSession', async () => {
  const outbound = await readJava('FolioleCompanionSyncGroupOutboundPeerStore.java');
  const explicitSigner = outbound.slice(
    outbound.indexOf('static JSObject signWithWorkgroupKey('),
    outbound.indexOf('static void bindRoute(')
  );

  expect(explicitSigner).toContain('JSONObject peer = find(context, groupId.trim(), normalizeEndpoint(endpointUrl))');
  expect(explicitSigner).toContain('peer.getString("local_authorization_id")');
  expect(explicitSigner).toContain('signCanonicalRequest(\n            workgroupKey, canonical)');
  expect(explicitSigner).not.toContain('FolioleCompanionWorkgroupSession');
});

it('freezes missing-key and route mismatch rejection ahead of signing', async () => {
  const [outbound, store] = await Promise.all([
    readJava('FolioleCompanionSyncGroupOutboundPeerStore.java'),
    readFile(path.join(root, 'src/shared/platform/companion/sync/syncGroupStore.ts'), 'utf8')
  ]);
  const findRoute = outbound.slice(
    outbound.indexOf('private static JSONObject find('),
    outbound.indexOf('private static String encrypt(')
  );

  expect(store).toMatch(/row\?\.workgroup_key[\s\S]*?row\.workgroup_key\.trim\(\)[\s\S]*?: null/u);
  expect(findRoute).toContain('!groupId.equals(candidate.optString("group_id"))');
  expect(findRoute).toContain('!endpointUrl.equals(candidate.optString("endpoint_url"))');
  expect(findRoute).toContain('sync_group_peer_ambiguous');
  expect(findRoute).toContain('sync_group_peer_not_found');
});
