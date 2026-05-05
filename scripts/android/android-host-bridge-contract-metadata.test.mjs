// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS } from '../../lib/core/database/androidCompanionBridgeContractDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BRIDGE_CONTRACT_DEFINITIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'companion-bridge-contract-definitions.json'
);
const BRIDGE_CONTRACT_READER = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionBridgeContractDefinitions.java'
);
const HOST_BRIDGE_CONTRACT_READER = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionHostBridgeContractDefinitions.java'
);
const HOST_API_CONSUMERS = [
  'FolioleCompanionBootstrapState.java',
  'FolioleCompanionContentBlobBatchStore.java',
  'FolioleCompanionContentBlobMultipartBatch.java',
  'FolioleCompanionDesktopHttpClient.java',
  'FolioleCompanionNetworkPluginActions.java',
  'FolioleCompanionNsdDiscovery.java',
  'FolioleCompanionSyncPackTransferPlugin.java',
  'FolioleCompanionWorkspaceSyncPluginActions.java'
].map((fileName) => path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android', fileName));

describe('Android host bridge contract metadata', () => {
  it('generates host API bridge contract keys', async () => {
    const definitions = JSON.parse(await readFile(BRIDGE_CONTRACT_DEFINITIONS, 'utf8'));

    expect(definitions.hostApi).toEqual(ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS.hostApi);
    expect(definitions.hostApi.network.discoveryDefaults).toMatchObject({
      emulatorHost: '10.0.2.2',
      endpointTemplate: 'http://{host}:{port}',
      hostToken: '{host}',
      port: 38641,
      portToken: '{port}',
      serviceType: '_foliole-sync._tcp.',
      timeoutMs: 1500
    });
    expect(definitions.hostApi.bootstrap.deviceNameDefaults).toEqual({
      defaultDeviceName: 'Android device',
      emulatorDeviceName: 'Android Emulator',
      emulatorModelTokens: ['sdk', 'gphone', 'emulator']
    });
    expect(definitions.hostApi.contentBlobBatch.responseHeaderKeys).toMatchObject({
      blobHash: 'x-blob-hash'
    });
    expect(definitions.hostApi.workspaceSync.requestKeys).toMatchObject({
      endpointUrl: 'endpoint_url',
      message: 'message',
      occurredAt: 'occurred_at',
      status: 'status'
    });
  });

  it('keeps host API Java wired to generated bridge contract keys', async () => {
    const combinedSource = (await Promise.all(HOST_API_CONSUMERS.map((filePath) => readFile(filePath, 'utf8')))).join('\n');
    const bridgeSource = await readFile(BRIDGE_CONTRACT_READER, 'utf8');
    const hostBridgeSource = await readFile(HOST_BRIDGE_CONTRACT_READER, 'utf8');

    expect(bridgeSource).toContain('hostApiString(Context context, String groupName, String objectName, String key)');
    expect(bridgeSource).toContain('hostApiInt(Context context, String groupName, String objectName, String key)');
    expect(bridgeSource).toContain('hostApiArray(Context context, String groupName, String objectName, String key)');
    expect(hostBridgeSource).toContain('workspaceSyncRequestKey(context, "endpointUrl")');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.bootstrapBootedAtOutputKey(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.bootstrapEmulatorModelTokens(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.contentBlobBatchBlobHashResponseHeaderKey(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.networkUrlRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.networkEndpointUrl(context, hostAddress)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.networkServiceType(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.networkDiscoveryTimeoutMs(context)');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.syncPackTransferUrlRequestKey(getContext())');
    expect(combinedSource).toContain('FolioleCompanionHostBridgeContractDefinitions.workspaceSyncEndpointUrlRequestKey');
    expect(combinedSource).not.toContain('getString("endpoint_url"');
    expect(combinedSource).not.toContain('getString("occurred_at"');
    expect(combinedSource).not.toContain('put("endpoint_urls"');
    expect(combinedSource).not.toContain('put("pack_path"');
    expect(combinedSource).not.toContain('put("status"');
    expect(combinedSource).not.toContain('put("body"');
    expect(combinedSource).not.toContain('optJSONObject("headers"');
    expect(combinedSource).not.toContain('"10.0.2.2"');
    expect(combinedSource).not.toContain('"http://"');
    expect(combinedSource).not.toContain('":38641"');
    expect(combinedSource).not.toContain('"_foliole-sync._tcp."');
    expect(combinedSource).not.toContain('"x-blob-hash"');
    expect(combinedSource).not.toContain('DISCOVERY_TIMEOUT_MS');
    expect(combinedSource).not.toContain('contains("sdk")');
    expect(combinedSource).not.toContain('contains("gphone")');
    expect(combinedSource).not.toContain('contains("emulator")');
    expect(hostBridgeSource).not.toContain('getJSONObject("deviceNameDefaults")');
    expect(hostBridgeSource).not.toContain('getJSONObject("discoveryDefaults")');
  });
});
