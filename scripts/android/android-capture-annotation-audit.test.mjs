// @vitest-environment node

import { expect, it } from 'vitest';

import { auditCaptureAnnotationDatabase } from './android-capture-annotation-audit.mjs';

function databaseFixture(overrides = {}) {
  const rows = {
    capture: {
      content: 'A5 capture task2-proof', current_version_id: 'android#capture', id: 'capture-1', last_modified_by_device_id: 'android-device',
      parent_id: 'special-inbox', updated_at: '2026-07-29T01:00:00.000Z'
    },
    cloze: {
      anchor_link: JSON.stringify({ kind: 'cloze', locator: { originalText: 'Cloze target alpha' } }),
      content: 'A5 capture [...]', current_version_id: 'android#cloze', id: 'cloze-1', kind: 'item',
      last_modified_by_device_id: 'android-device', reveal: 'Cloze target alpha', updated_at: '2026-07-29T01:01:00.000Z'
    },
    note: {
      anchor_link: JSON.stringify({ kind: 'highlight', locator: { originalText: 'Note target beta' } }),
      content: 'Note target beta\n\nNote: A5 note task2-proof', current_version_id: 'android#note', id: 'note-1', kind: 'topic',
      last_modified_by_device_id: 'android-device', updated_at: '2026-07-29T01:02:00.000Z'
    },
    review: { due: '2026-07-29T01:01:00.000Z', state: 0 },
    ...overrides
  };
  let call = 0;
  return { prepare: () => ({ get: () => rows[['capture', 'cloze', 'note', 'review'][call++]] }) };
}

it('summarizes persisted Capture, Cloze, Note, source anchors, review, and device identity', () => {
  const summary = auditCaptureAnnotationDatabase(databaseFixture(), 'task2-proof');
  expect(summary).toMatchObject({
    capture: { currentVersionId: 'android#capture', deviceId: 'android-device', nodeId: 'capture-1', parentNodeId: 'special-inbox' },
    cloze: { hasAnchor: true, hasReview: true, nodeId: 'cloze-1', reveal: 'Cloze target alpha', sourceText: 'Cloze target alpha' },
    note: { hasAnchor: true, nodeId: 'note-1', sourceText: 'Note target beta' },
    resultStatus: 'success', token: 'task2-proof'
  });
});

it('rejects a batch whose Note lacks a stable source anchor', () => {
  expect(() => auditCaptureAnnotationDatabase(databaseFixture({ note: {
    anchor_link: null, content: 'Note target beta\n\nNote: A5 note task2-proof',
    current_version_id: 'android#note', id: 'note-1', kind: 'topic', last_modified_by_device_id: 'android-device',
    updated_at: '2026-07-29T01:02:00.000Z'
  } }), 'task2-proof')).toThrow('source anchor is missing');
});
