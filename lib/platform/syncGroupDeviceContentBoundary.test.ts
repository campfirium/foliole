// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { PACK_SCHEMA } from '../core/sync/syncPackSchema.js';

import {
  assertBusinessPayloadExcludesDeviceIdentity,
  DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS
} from './syncGroupDeviceContentBoundary.js';

it('keeps T152 Device identity out of nested business payloads', () => {
  expect(() => assertBusinessPayloadExcludesDeviceIdentity({
    node: { content: 'Body', version: { parents: ['base'] } },
    review: [{ grade: 3 }]
  })).not.toThrow();
  for (const key of DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS) {
    expect(() => assertBusinessPayloadExcludesDeviceIdentity({ node: { [key]: 'device-a' } }))
      .toThrow(`device_identity_in_business_payload:${key}`);
  }
});

it('keeps the current Sync Pack schema free of T152 Device identity fields', () => {
  const schema = PACK_SCHEMA.join('\n');
  for (const key of DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS) expect(schema).not.toMatch(new RegExp(`\\b${key}\\b`));
});

it('removes the inactive T151 manager/member admission prepare', () => {
  const retired = [
    'lib/core/database/syncGroupUnifiedSchemaStatements.ts',
    'lib/core/sync/syncGroupLifecycleAuthority.ts',
    'lib/platform/syncGroupLifecycleContract.ts',
    'lib/platform/syncGroupAuthorizationContract.ts'
  ];
  for (const relativePath of retired) expect(fs.existsSync(path.resolve(relativePath))).toBe(false);
});
