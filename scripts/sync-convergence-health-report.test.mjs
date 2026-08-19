// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSyncConvergenceHealthReport,
  formatSyncConvergenceHealthReport,
  parseArgs
} from './sync-convergence-health-report.mjs';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-convergence-health-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function desktop(overrides = {}) {
  return {
    connection: { state: 'running' },
    sync_state: { local_dirty_count: 0, max_state_seq: 10 },
    verdicts: [{ code: 'desktop_ready', message: 'Desktop sync state is readable.', severity: 'ok' }],
    ...overrides
  };
}

function android(overrides = {}) {
  return {
    content: { missingMetadata: [] },
    cursors: { androidCursor: 10, desktopMaxSeq: 10, gap: 0, pending: { liveCount: 0, tombstoneCount: 0 } },
    localPush: { dirtyCount: 0, dirtyTypes: [], issueCount: 0, issueTypes: [] },
    resources: {
      availableWithoutData: [],
      missingAttachmentResources: 0,
      missingExternalDocumentBodies: 0,
      missingNodeBodies: 0,
      missingReferencedContentBlobs: 0
    },
    statePolicy: {
      hostPrivate: {
        nonLocalNodeReadingHostStateRows: 0,
        nonLocalNodeViewStateRows: 0
      }
    },
    structural: [
      { missingOnAndroid: [], name: 'nodes', positionMismatches: [] },
      { missingOnAndroid: [], name: 'node_order', positionMismatches: [] }
    ],
    syncEvents: { latestRun: { result: 'completed' } },
    suspectedBrokenLayer: 'no obvious structural break',
    ...overrides
  };
}

function expectLayer(input, layer, status = 'degraded') {
  const report = buildSyncConvergenceHealthReport(input);
  expect(report.primaryLayer).toBe(layer);
  expect(report.status).toBe(status);
  return report;
}

describe('sync convergence health report', () => {
  it('marks complete healthy desktop and Android inputs as converged', () => {
    const report = expectLayer({ androidAudit: android(), desktopDiagnostics: desktop() }, 'converged', 'converged');
    expect(formatSyncConvergenceHealthReport(report)).toContain('primary_layer : converged');
  });

  it('keeps one-sided input partial instead of claiming convergence', () => {
    const report = expectLayer({ androidAudit: android(), desktopDiagnostics: null }, 'partial', 'partial');
    expect(report.evidence[0]).toMatchObject({ layer: 'partial' });
  });

  it('prioritizes desktop diagnostic errors before Android evidence', () => {
    expectLayer({
      androidAudit: android({ localPush: { dirtyCount: 1, dirtyTypes: [{ count: 1, objectType: 'node' }], issueCount: 0, issueTypes: [] } }),
      desktopDiagnostics: desktop({
        verdicts: [{ code: 'desktop_has_nodes_missing_state_rows', message: 'Missing state rows.', severity: 'error' }]
      })
    }, 'desktop_diagnostics');
  });

  it('classifies Android local push blockers', () => {
    expectLayer({
      androidAudit: android({
        localPush: {
          dirtyCount: 0,
          dirtyTypes: [],
          issueCount: 1,
          issueTypes: [{ count: 1, objectType: 'node_review', status: 'conflict' }]
        }
      }),
      desktopDiagnostics: desktop()
    }, 'local_push_blocker');
  });

  it('classifies cursor advancement before structural gaps', () => {
    expectLayer({
      androidAudit: android({
        cursors: { androidCursor: 12, desktopMaxSeq: 10, gap: -2, pending: { liveCount: 0, tombstoneCount: 0 } },
        structural: [{ missingOnAndroid: ['node-2'], name: 'nodes', positionMismatches: [] }]
      }),
      desktopDiagnostics: desktop()
    }, 'cursor');
  });

  it('classifies structural diffs', () => {
    expectLayer({
      androidAudit: android({
        structural: [{ missingOnAndroid: ['node-2'], name: 'node_order', positionMismatches: [] }]
      }),
      desktopDiagnostics: desktop()
    }, 'structure');
  });

  it('classifies Host-private state leaks as warnings', () => {
    expectLayer({
      androidAudit: android({
        statePolicy: {
          hostPrivate: {
            nonLocalNodeReadingHostStateRows: 1,
            nonLocalNodeViewStateRows: 0
          }
        }
      }),
      desktopDiagnostics: desktop()
    }, 'host_private_state', 'warning');
  });

  it('classifies missing content metadata before resource bytes', () => {
    expectLayer({
      androidAudit: android({
        content: { missingMetadata: ['hash-1'] },
        resources: { ...android().resources, missingReferencedContentBlobs: 1 }
      }),
      desktopDiagnostics: desktop()
    }, 'content_metadata', 'warning');
  });

  it('classifies missing resource bytes', () => {
    expectLayer({
      androidAudit: android({
        resources: { ...android().resources, missingAttachmentResources: 2 }
      }),
      desktopDiagnostics: desktop()
    }, 'resource_bytes', 'warning');
  });

  it('classifies failed latest Activity run when data otherwise converges', () => {
    expectLayer({
      androidAudit: android({ syncEvents: { latestRun: { result: 'failed' } } }),
      desktopDiagnostics: desktop()
    }, 'activity_reporting', 'warning');
  });

  it('parses explicit JSON input flags and rejects empty invocations', async () => {
    const desktopPath = path.join(tempRoot, 'desktop.json');
    const androidPath = path.join(tempRoot, 'android.json');
    await fs.writeFile(desktopPath, '{}');
    await fs.writeFile(androidPath, '{}');

    expect(parseArgs(['--desktop-diagnostics-json', desktopPath, '--android-audit-json', androidPath])).toEqual({
      androidAuditPath: androidPath,
      desktopDiagnosticsPath: desktopPath
    });
    expect(() => parseArgs([])).toThrow('provide --desktop-diagnostics-json');
  });
});
