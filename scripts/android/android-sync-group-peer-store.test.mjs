// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PEER_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncGroupPeerStore.java'
);
const APP_DATA_STORE = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionAppDataStore.java'
);
const OUTBOUND_STORE = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionSyncGroupOutboundPeerStore.java'
);
const PAIRING_ACTIONS = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionPairingPluginActions.java'
);
const NETWORK_ACTIONS = path.join(
  REPO_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'foliole', 'android',
  'FolioleCompanionNetworkPluginActions.java'
);

describe('FolioleCompanionSyncGroupPeerStore', () => {
  it('lets Android Keystore generate the AES-GCM encryption IV', async () => {
    const source = await readFile(PEER_STORE, 'utf8');
    const saveBody = source.slice(source.indexOf('private static void save'), source.indexOf('private static SharedPreferences prefs'));

    expect(saveBody).toContain('cipher.init(Cipher.ENCRYPT_MODE, key());');
    expect(saveBody).toContain('byte[] iv = cipher.getIV();');
    expect(saveBody).not.toContain('new GCMParameterSpec(128, iv)');
    expect(saveBody).not.toContain('new java.security.SecureRandom()');
  });

  it('clears Sync Group transport credentials with the rest of companion app data', async () => {
    const source = await readFile(APP_DATA_STORE, 'utf8');
    expect(source).toContain('FolioleCompanionSyncGroupPeerStore.clear(context);');
    expect(source).toContain('FolioleCompanionSyncGroupOutboundPeerStore.clear(context);');
    expect(source).toContain('FolioleCompanionSyncGroupJoinGrantStore.clear(context);');
  });

  it('rebinds a discovered route by peer identity and fails closed on group mismatch', async () => {
    const source = await readFile(OUTBOUND_STORE, 'utf8');
    const bindBody = source.slice(source.indexOf('static void bindRoute'), source.indexOf('static boolean contains'));

    expect(bindBody).toContain('prefs(context).getString(normalizedPeerId, null)');
    expect(bindBody).toContain('groupId.trim().equals(peer.optString("group_id"))');
    expect(bindBody).toContain('peer.put("endpoint_url", normalizeEndpoint(endpointUrl))');
    expect(bindBody).not.toContain('getAll()');
  });

  it('lands the Web route-binding payload in the Android peer store', async () => {
    const source = await readFile(PAIRING_ACTIONS, 'utf8');
    const action = source.slice(source.indexOf('static void bindSyncGroupPeerRoute'));

    expect(action).toContain('routeBindingKey(context, "syncGroupId")');
    expect(action).toContain('routeBindingKey(context, "peerAuthorizationId")');
    expect(action).toContain('routeBindingKey(context, "endpointUrl")');
    expect(action).toContain('FolioleCompanionSyncGroupOutboundPeerStore.save(');
    expect(action).toContain('context, groupId, localAuthorizationId, localHostName,');
    expect(action).toContain('peerAuthorizationId, peerHostName, peerHostPlatform, endpointUrl');
    expect(action).not.toContain('routeBindingKey(context, "localDeviceId")');
    expect(action).not.toContain('routeBindingKey(context, "peerDeviceId")');
  });

  it('stores outbound authorization routes without retired Device identity fields', async () => {
    const source = await readFile(OUTBOUND_STORE, 'utf8');
    expect(source).toContain('.put("local_authorization_id", localAuthorizationId.trim())');
    expect(source).toContain('.put("peer_authorization_id", peerAuthorizationId.trim())');
    expect(source).not.toContain('local_device_id');
    expect(source).not.toContain('peer_device_id');
  });

  it('offers persisted peer routes as identity-verified discovery candidates', async () => {
    const [store, network] = await Promise.all([
      readFile(OUTBOUND_STORE, 'utf8'), readFile(NETWORK_ACTIONS, 'utf8')
    ]);
    const routes = store.slice(store.indexOf('static List<String> discoveryEndpointUrls'),
      store.indexOf('static void clear'));

    expect(routes).toContain('optString("endpoint_url")');
    expect(routes).not.toContain('getString("secret")');
    expect(network).toContain('FolioleCompanionSyncGroupOutboundPeerStore.discoveryEndpointUrls(context)');
    expect(network).toContain('addDirectEndpointCandidate(context, candidates, endpointUrl)');
  });
});
