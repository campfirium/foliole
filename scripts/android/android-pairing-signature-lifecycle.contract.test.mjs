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

const readJava = async (name) => (await readFile(path.join(javaRoot, name), 'utf8')).replace(/\r\n?/gu, '\n');

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

it('keeps current-group signing independent from a provider session', async () => {
  const outbound = await readJava('FolioleCompanionSyncGroupOutboundPeerStore.java');
  const currentSigner = outbound.slice(
    outbound.indexOf('static JSObject signCurrentGroupRequest('),
    outbound.indexOf('static void bindRoute(')
  );

  expect(currentSigner).toContain('JSONObject peer = find(context, groupId.trim(), normalizeEndpoint(endpointUrl))');
  expect(currentSigner).toContain('currentCredential(context, groupId, peer)');
  expect(currentSigner).toContain('peer.getString("local_authorization_id")');
  expect(currentSigner).not.toContain('FolioleCompanionWorkgroupSession');
});

it('prepares and sends an outbound envelope without a provider session', async () => {
  const [client, outbound, workgroup] = await Promise.all([
    readJava('FolioleCompanionDesktopHttpClient.java'),
    readJava('FolioleCompanionSyncGroupOutboundPeerStore.java'),
    readJava('FolioleCompanionWorkgroupHttp.java')
  ]);
  const currentPreparation = outbound.slice(
    outbound.indexOf('static JSObject prepareCurrentGroupRequest('),
    outbound.indexOf('static void bindRoute(')
  );
  const keyPreparation = workgroup.slice(
    workgroup.indexOf('static PreparedRequest prepareWithKey('),
    workgroup.indexOf('static boolean isPrepared(')
  );

  expect(currentPreparation).toContain('FolioleCompanionWorkgroupHttp.prepareWithKey(');
  expect(currentPreparation).toContain('currentCredential(context, groupId, peer)');
  expect(currentPreparation).not.toContain('FolioleCompanionWorkgroupSession');
  expect(keyPreparation).not.toContain('FolioleCompanionWorkgroupSession');
  expect(client).toContain('? FolioleCompanionWorkgroupHttp.acceptPrepared');
  expect(client).toContain('&& !preparedWorkgroup');
});

it('loads production group signing material through the shared data-owner bridge', async () => {
  const [actions, contract, currentCredential, outbound, plugin] = await Promise.all([
    readJava('FolioleCompanionPairingPluginActions.java'),
    readFile(path.join(root, 'android/app/src/main/assets/companion-bridge-contract-definitions.json'), 'utf8'),
    readJava('FolioleCompanionCurrentGroupCredential.java'),
    readJava('FolioleCompanionSyncGroupOutboundPeerStore.java'),
    readJava('FolioleCompanionSyncPlugin.java')
  ]);
  const signAction = actions.slice(
    actions.indexOf('static void signCompanionSyncRequest('),
    actions.indexOf('static void bindSyncGroupPeerRoute(')
  );

  expect(JSON.parse(contract).pairingPlugin.signature.requestKeys.body).toBe('body');
  expect(JSON.parse(contract).pairingPlugin.signature.requestKeys).not.toHaveProperty('workgroupKey');
  expect(signAction).toContain('prepareCurrentGroupRequest');
  expect(signAction).toContain('FolioleCompanionSyncGroupOutboundPeerStore.signCurrentGroupRequest(');
  expect(signAction).toContain('FolioleCompanionPairingStore.signRequest(');
  expect(currentCredential).toContain('FolioleCompanionSyncGroupDataBridge.current().request(');
  expect(currentCredential).toContain('"load_current_credential"');
  expect(currentCredential).not.toContain('SQLiteDatabase');
  expect(outbound).not.toContain('FolioleCompanionWorkgroupSession');
  expect(plugin).toContain('FolioleCompanionSyncGroupDataBridge.install(');
  expect(plugin).toMatch(/signCompanionSyncRequest[\s\S]*fileExecutor\.execute/u);
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
