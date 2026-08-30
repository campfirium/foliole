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

it('proves a canonical Inbox and local device identity without requiring synced content', () => {
  const inspection = inspectCaptureAnnotationWorkspace(databaseFixture({
    counts: { content_blobs: 10, node_order: 0, nodes: 11 },
    meta: { device_id: 'android-a5' }
  }));
  const readiness = captureAnnotationReadiness({ database: { exists: true, inspection } });
  expect(readiness).toMatchObject({
    canonicalInbox: { active: true, kind: 'folder' },
    counts: { content_blobs: 10, node_order: 0, nodes: 11 },
    missingPrerequisites: [],
    pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: false },
    resultStatus: 'ready'
  });
  expect(JSON.stringify(readiness)).not.toMatch(/android-a5/iu);
});

it('requires only the canonical Inbox and local device identity', () => {
  const inspection = inspectCaptureAnnotationWorkspace(databaseFixture({ inbox: null }));
  expect(captureAnnotationReadiness({ database: { exists: true, inspection } })).toMatchObject({
    counts: { content_blobs: 0, node_order: 0, nodes: 0 },
    missingPrerequisites: ['canonical_inbox_missing', 'device_identity_missing'],
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
