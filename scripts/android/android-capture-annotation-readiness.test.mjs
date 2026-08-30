// @vitest-environment node

import { expect, it } from 'vitest';

import {
  captureAnnotationReadiness, inspectCaptureAnnotationWorkspace
} from './android-capture-annotation-readiness.mjs';

function databaseFixture({ counts = {}, inbox = { kind: 'folder' }, meta = {} } = {}) {
  const tables = new Set(['nodes', 'node_order', 'content_blobs', 'companion_meta']);
  return {
    prepare(sql) {
      return {
        get(value) {
          if (sql.includes('sqlite_master')) return tables.has(value) ? { 1: 1 } : undefined;
          if (sql.includes('COUNT(*)')) {
            const table = /FROM (\w+)/u.exec(sql)?.[1];
            return { count: counts[table] ?? 0 };
          }
          if (sql.includes("id = 'special-inbox'")) return inbox;
          if (sql.includes('companion_meta')) return meta[value] ? { present: 1 } : undefined;
          throw new Error(`Unexpected SQL: ${sql}`);
        }
      };
    }
  };
}

it('proves a populated canonical Inbox workspace without returning identity or endpoint values', () => {
  const inspection = inspectCaptureAnnotationWorkspace(databaseFixture({
    counts: { content_blobs: 19, node_order: 12, nodes: 13 },
    meta: { device_id: 'android-a5', workspace_sync_endpoint_url: 'http://windows:38641?secret=x' }
  }));
  const readiness = captureAnnotationReadiness({ database: { exists: true, inspection } });
  expect(readiness).toMatchObject({
    canonicalInbox: { active: true, kind: 'folder' },
    counts: { content_blobs: 19, node_order: 12, nodes: 13 },
    missingPrerequisites: [],
    pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true },
    resultStatus: 'ready'
  });
  expect(JSON.stringify(readiness)).not.toMatch(/android-a5|windows:38641|secret/iu);
});

it('requires approval for an empty or unpaired workspace and exposes only bounded conclusions', () => {
  const inspection = inspectCaptureAnnotationWorkspace(databaseFixture({ inbox: null }));
  expect(captureAnnotationReadiness({ database: { exists: true, inspection } })).toMatchObject({
    counts: { content_blobs: 0, node_order: 0, nodes: 0 },
    missingPrerequisites: [
      'acceptance_workspace_empty', 'canonical_inbox_missing', 'pairing_workspace_unproven'
    ],
    resultStatus: 'approval_required'
  });
});

it('fails closed when no readable device database can be proven', () => {
  expect(captureAnnotationReadiness({ database: { exists: false } })).toMatchObject({
    missingPrerequisites: ['database_missing'], resultStatus: 'approval_required'
  });
  expect(captureAnnotationReadiness({ database: { exists: true, unreadable: true } })).toMatchObject({
    missingPrerequisites: ['database_unreadable'], resultStatus: 'approval_required'
  });
});
