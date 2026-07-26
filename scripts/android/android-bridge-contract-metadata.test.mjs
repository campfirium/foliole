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
const RESOURCE_PLUGIN_ACTIONS = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionResourcePluginActions.java'
);
const BRIDGE_CONTRACT_READER = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionBridgeContractDefinitions.java'
);
const BRIDGE_CONTRACT_ASSET_READER = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionBridgeContractAsset.java'
);
const PAIRING_PLUGIN_ACTIONS = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingPluginActions.java'
);
const PAIRING_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingStore.java'
);
const PAIRING_PROTOCOL_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingProtocolStore.java'
);
const PAIRING_PEER_CONTRACT = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingPeerContractDefinitions.java'
);
const PAIRING_METADATA = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingMetadata.java'
);
const RESOURCE_STORE_SOURCES = [
  'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceBatchStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionAttachmentResourceMissingStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobBatchManifestStore.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobMultipartBatch.java',
  'android/app/src/main/java/com/foliole/android/FolioleCompanionContentBlobStore.java'
].map((sourcePath) => path.join(REPO_ROOT, sourcePath));

describe('Android bridge contract metadata', () => {
  it('generates resource plugin request contract keys', async () => {
    const definitions = JSON.parse(await readFile(BRIDGE_CONTRACT_DEFINITIONS, 'utf8'));

    expect(definitions.resourcePlugin).toEqual(ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS.resourcePlugin);
    expect(definitions.resourcePlugin.requestKeys).toMatchObject({
      attachmentId: 'attachment_id',
      body: 'body',
      contentHash: 'content_hash',
      documentId: 'document_id',
      hash: 'hash',
      headers: 'headers',
      limit: 'limit',
      query: 'query',
      resources: 'resources',
      url: 'url'
    });
  });

  it('generates pairing bridge and signature contract keys', async () => {
    const definitions = JSON.parse(await readFile(BRIDGE_CONTRACT_DEFINITIONS, 'utf8'));

    expect(definitions.pairingPlugin).toEqual(ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS.pairingPlugin);
    expect(definitions.pairingPlugin.credentialRequestKeys).toMatchObject({
      deviceId: 'device_id',
      deviceKind: 'device_kind',
      deviceName: 'device_name',
      deviceSecret: 'device_secret',
      remotePeerId: 'remote_peer_id',
      remotePeerName: 'remote_peer_name',
      remotePeerPlatform: 'remote_peer_platform',
      pairedAt: 'paired_at'
    });
    expect(definitions.pairingPlugin.storageKeys).toMatchObject({
      keyAlias: 'foliole_companion_pairing_secret',
      preferencesName: 'foliole_companion_pairing'
    });
    expect(definitions.pairingPlugin.signature).toMatchObject({
      headerKeys: {
        deviceId: 'X-Device-Id',
        nonce: 'X-Nonce',
        signature: 'X-Signature',
        timestamp: 'X-Timestamp'
      },
      requestKeys: {
        bodyHash: 'body_hash',
        pathWithQuery: 'path_with_query'
      },
      responseKeys: {
        headers: 'headers'
      }
    });
  });

  it('keeps resource plugin actions wired to generated bridge contract keys', async () => {
    const source = await readFile(RESOURCE_PLUGIN_ACTIONS, 'utf8');
    const bridgeSource = await readFile(BRIDGE_CONTRACT_READER, 'utf8');

    expect(bridgeSource).toContain('resourceRequestKey(context, "attachmentId")');
    expect(bridgeSource).toContain('resourceDefault(context, "missingResourceLimit")');
    expect(bridgeSource).toContain('resourceDefault(context, "topicSearchLimit")');
    expect(bridgeSource).toContain('intValue(context, "resourcePlugin", "defaults", key)');
    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey');
    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey');
    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceMissingResourceLimitDefault(context)');
    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceTopicSearchLimitDefault(context)');
    expect(source).not.toContain('getString("attachment_id"');
    expect(source).not.toContain('getString("content_hash"');
    expect(source).not.toContain('getString("document_id"');
    expect(source).not.toContain('getString("hash"');
    expect(source).not.toContain('getString("url"');
    expect(source).not.toContain('getString("body"');
    expect(source).not.toContain('getString("query"');
    expect(source).not.toContain('optJSONObject("headers"');
    expect(source).not.toContain('optJSONArray("resources"');
    expect(source).not.toContain('getInt("limit"');
  });

  it('keeps resource store validation labels wired to bridge contract keys', async () => {
    const combinedSource = (await Promise.all(RESOURCE_STORE_SOURCES.map((sourcePath) => readFile(sourcePath, 'utf8'))))
      .join('\n');

    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceAttachmentIdRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceContentHashRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceHashRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceHeadersRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceResourcesRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.resourceUrlRequestKey(context)');
    expect(combinedSource).not.toContain('resourceObject(context, "syncRequestKeys")');
    expect(combinedSource).not.toContain('requireText(attachmentId, "attachment_id"');
    expect(combinedSource).not.toContain('requireText(url, "url"');
    expect(combinedSource).not.toContain('requireText(value, "hash"');
    expect(combinedSource).not.toContain('IllegalArgumentException("hash is invalid."');
  });

  it('keeps pairing Java wired to generated bridge contract keys', async () => {
    const combinedSource = [
      await readFile(PAIRING_PLUGIN_ACTIONS, 'utf8'),
      await readFile(PAIRING_STORE, 'utf8'),
      await readFile(PAIRING_PROTOCOL_STORE, 'utf8'),
      await readFile(PAIRING_PEER_CONTRACT, 'utf8'),
      await readFile(PAIRING_METADATA, 'utf8')
    ].join('\n');
    const bridgeSource = await readFile(BRIDGE_CONTRACT_READER, 'utf8');
    const assetReaderSource = await readFile(BRIDGE_CONTRACT_ASSET_READER, 'utf8');

    expect(bridgeSource).toContain('pairingCredentialRequestKey(context, "deviceId")');
    expect(bridgeSource).toContain('pairingSignatureRequestKey(context, "method")');
    expect(assetReaderSource).toContain('object(context, "pairingPlugin", "signature").optJSONObject(objectName)');
    expect(assetReaderSource).not.toContain('getJSONObject("signature")');
    expect(bridgeSource).toContain('pairingPreferenceKey(context, "deviceId")');
    expect(bridgeSource).toContain('pairingPreferenceKey(context, "remoteProtocol")');
    expect(bridgeSource).toContain('pairingStorageKey(context, "keyAlias")');
    expect(bridgeSource).toContain('pairingStateKey(context, "deviceId")');
    expect(combinedSource).toContain('FolioleCompanionPairingPeerContractDefinitions.remotePeerNameStateKey(context)');
    expect(bridgeSource).toContain('pairingSignatureHeaderKey(context, "deviceId")');
    expect(bridgeSource).toContain('pairingSignatureResponseKey(context, "headers")');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingDeviceIdCredentialRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingMethodSignatureRequestKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingDeviceIdPreferenceKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingPreferencesNameStorageKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingKeyAliasStorageKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingDeviceIdStateKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingRemoteProtocolStateKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingSyncUsableStateKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingDeviceIdSignatureHeaderKey(context)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingHeadersSignatureResponseKey(context)');
    expect(combinedSource).not.toContain('preferenceKey(context, "');
    expect(combinedSource).not.toContain('stateKey(context, "');
    expect(combinedSource).not.toContain('signatureHeaderKey(context, "');
    expect(combinedSource).not.toContain('signatureResponseKey(context, "');
    expect(combinedSource).not.toContain('getString("device_id"');
    expect(combinedSource).not.toContain('getString("device_kind"');
    expect(combinedSource).not.toContain('getString("device_name"');
    expect(combinedSource).not.toContain('getString("device_secret"');
    expect(combinedSource).not.toContain('getString("paired_at"');
    expect(combinedSource).not.toContain('getString("path_with_query"');
    expect(combinedSource).not.toContain('getString("body_hash"');
    expect(combinedSource).not.toContain('put("device_id"');
    expect(combinedSource).not.toContain('put("device_kind"');
    expect(combinedSource).not.toContain('put("device_name"');
    expect(combinedSource).not.toContain('put("is_paired"');
    expect(combinedSource).not.toContain('put("paired_at"');
    expect(combinedSource).not.toContain('put("headers"');
    expect(combinedSource).not.toContain('put("X-Device-Id"');
    expect(combinedSource).not.toContain('put("X-Timestamp"');
    expect(combinedSource).not.toContain('put("X-Nonce"');
    expect(combinedSource).not.toContain('put("X-Signature"');
    expect(combinedSource).not.toContain('"foliole_companion_pairing_secret"');
    expect(combinedSource).not.toContain('"foliole_companion_pairing"');
  });

});
