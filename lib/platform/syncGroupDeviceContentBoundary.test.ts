// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { projectFramedSyncNodeRecord, restoreFramedSyncProjectedNodeRecord } from '../core/sync/framedSyncNodeProjection.js';

import type { NativeSyncNodeRecord } from './nativeSyncContract.js';
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

it('keeps Device identity out of current request node facts and restored business payloads', () => {
  const node = businessNode();
  const input = { ...node, device_anchor: 'private-device', canonical_library_path: '/private/library',
    device_identity_key: 'private-identity', snapshot: { ...node.snapshot,
      device_anchor: 'private-device', canonical_library_path: '/private/library',
      device_identity_key: 'private-identity' } };
  const projection = projectFramedSyncNodeRecord(input);
  const restored = restoreFramedSyncProjectedNodeRecord(projection);
  expect(restored.snapshot).toMatchObject({ id: 'node', title: 'Topic', content: 'Body' });
  expect(() => assertBusinessPayloadExcludesDeviceIdentity(restored)).not.toThrow();
  for (const fact of projection.manifest.facts) {
    const fields = JSON.stringify(fact.body, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value);
    for (const key of DEVICE_IDENTITY_BUSINESS_PAYLOAD_KEYS) {
      expect(fields).not.toContain(`"name":"${key}"`);
    }
  }
});

function businessNode(): NativeSyncNodeRecord {
  return {
    object_type: 'node', object_id: 'node', version_id: 'version', parent_version_id: null,
    ancestor_version_ids: [], host_name: 'Host', updated_at: '2026-10-14T00:00:00.000Z',
    content_hash: 'a'.repeat(64), body_text: 'Body', version_created_at: '2026-10-14T00:00:00.000Z',
    snapshot: {
      id: 'node', kind: 'topic', title: 'Topic', content: 'Body', parent_id: null,
      created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z',
      deleted_at: null, attachments: [], anchor_link: null, desired_retention: null,
      hide_title_heading: false, image_regions: null, is_title_manual: false,
      opening_text: null, position: null, priority: null, reveal: null, virtual_filter: null
    }
  };
}

it('removes the inactive T151 manager/member admission prepare', () => {
  const retired = [
    'lib/core/database/syncGroupUnifiedSchemaStatements.ts',
    'lib/core/sync/syncGroupLifecycleAuthority.ts',
    'lib/platform/syncGroupLifecycleContract.ts',
    'lib/platform/syncGroupAuthorizationContract.ts'
  ];
  for (const relativePath of retired) expect(fs.existsSync(path.resolve(relativePath))).toBe(false);
});
