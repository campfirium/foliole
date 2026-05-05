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
const PAIRING_PLUGIN_ACTIONS = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingPluginActions.java'
);
const PAIRING_STORE = path.join(
  REPO_ROOT,
  'android/app/src/main/java/com/foliole/android/FolioleCompanionPairingStore.java'
);

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
      pairedAt: 'paired_at'
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

    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceRequestKey(context, key)');
    expect(source).toContain('FolioleCompanionBridgeContractDefinitions.resourceDefault(context, key)');
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

  it('keeps pairing Java wired to generated bridge contract keys', async () => {
    const combinedSource = [
      await readFile(PAIRING_PLUGIN_ACTIONS, 'utf8'),
      await readFile(PAIRING_STORE, 'utf8')
    ].join('\n');

    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingCredentialRequestKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingPreferenceKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingSignatureHeaderKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingSignatureRequestKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingSignatureResponseKey(context, key)');
    expect(combinedSource).toContain('FolioleCompanionBridgeContractDefinitions.pairingStateKey(context, key)');
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
  });
});
