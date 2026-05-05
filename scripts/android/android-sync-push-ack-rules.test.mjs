// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../lib/core/database/androidCompanionSyncProtocolDefinitions.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SYNC_PROTOCOL_DEFINITIONS = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'companion-sync-protocol-definitions.json'
);
const SYNC_PUSH_ACK_STORE = path.join(
  REPO_ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'foliole',
  'android',
  'FolioleCompanionSyncPushAckStore.java'
);

describe('Android sync push ack protocol rules', () => {
  it('loads push ack protocol rules from generated definitions', async () => {
    const definitions = JSON.parse(await readFile(SYNC_PROTOCOL_DEFINITIONS, 'utf8'));
    const source = await readFile(SYNC_PUSH_ACK_STORE, 'utf8');

    expect(definitions).toEqual(ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS);
    expect(source).toContain('FolioleCompanionSyncPushAckRules.load(context)');
    expect(source).not.toContain('status.equals("accepted")');
    expect(source).not.toContain('objectType.equals("review_log")');
  });
});
