import { describe, expect, it } from 'vitest';

import { buildSyncConvergenceReport } from './companionSyncConvergence';
import { syncConvergenceResult } from './companionSyncConvergence.testHelpers';

function testKeepsBodyBacklogPending() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      content: { missing_content_blob_count: 3, missing_external_document_body_count: 1, missing_topic_body_count: 2 },
      sync_state: { ...syncConvergenceResult().android!.sync_state }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'content_backlog_exists',
      detail: '3 topic body files remain to download: 2 topics, 1 external document.'
    })
  ]));
  expect(report.checks.map((item) => item.code)).toEqual(expect.arrayContaining([
    'content_backlog_exists'
  ]));
}

function testKeepsAttachmentBacklogPending() {
  const report = buildSyncConvergenceReport(syncConvergenceResult({
    android: {
      ...syncConvergenceResult().android!,
      content: { missing_attachment_resource_count: 2, missing_content_blob_count: 0 }
    }
  }));

  expect(report.status).toBe('pending');
  expect(report.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'attachment_backlog_exists', severity: 'info' })
  ]));
}

describe('buildSyncConvergenceReport backlog checks', () => {
  it('keeps body backlog as pending work', testKeepsBodyBacklogPending);
  it('keeps attachment backlog as pending work', testKeepsAttachmentBacklogPending);
});
