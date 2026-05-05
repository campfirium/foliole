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
});
