// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  formatScenarioReport,
  parseArgs,
  sampleSyncScenario
} from './android-sync-scenario-sampler.mjs';

function createReport(overrides = {}) {
  return {
    cursors: {
      androidCursor: 12,
      desktopMaxSeq: 15,
      gap: 3,
      pending: { liveCount: 2, tombstoneCount: 1, types: [] }
    },
    identity: { androidEndpoint: 'http://10.0.2.2:38641', androidSerial: 'emulator-5554' },
    localPush: { dirtyCount: 0, issueCount: 0 },
    resources: {
      missingAttachmentResources: 1,
      missingExternalDocumentBodies: 2,
      missingNodeBodies: 3
    },
    structural: [
      { androidCount: 10, desktopCount: 10, missingOnAndroid: [], name: 'nodes' },
      { androidCount: 9, desktopCount: 10, missingOnAndroid: ['node-10'], name: 'node_order' },
      { androidCount: 1, desktopCount: 1, missingOnAndroid: [], name: 'external_documents' }
    ],
    suspectedBrokenLayer: 'node_order apply',
    syncEvents: {
      latestRun: { message: 'Library index applied.', result: 'success' }
    },
    ...overrides
  };
}

describe('android sync scenario sampler', () => {
  it('parses ordered unique sampling offsets', () => {
    expect(parseArgs(['--at', '6,0,3,3', '--json']).atSeconds).toEqual([0, 3, 6]);
    expect(parseArgs(['--at', '6,0,3,3', '--json']).json).toBe(true);
  });

  it('samples reports over the requested timeline without destructive actions', async () => {
    const sleeps = [];
    const result = await sampleSyncScenario(
      { atSeconds: [0, 3, 6] },
      async () => ({ report: createReport() }),
      async (milliseconds) => sleeps.push(milliseconds)
    );

    expect(sleeps).toEqual([0, 3000, 3000]);
    expect(result.samples).toHaveLength(3);
    expect(result.samples[0]).toMatchObject({
      endpoint: 'http://10.0.2.2:38641',
      suspectedLayer: 'node_order apply'
    });
  });

  it('formats structure, resource, cursor and latest run facts per sample', async () => {
    const result = await sampleSyncScenario(
      { atSeconds: [0] },
      async () => ({ report: createReport() }),
      async () => {}
    );

    const output = formatScenarioReport(result);

    expect(output).toContain('=== t+0s');
    expect(output).toContain('cursor android=12 desktop=15 gap=3');
    expect(output).toContain('node_order=9/10 missing=1');
    expect(output).toContain('resources node_bodies=3 external_bodies=2 attachments=1');
    expect(output).toContain('local_push dirty=0 issues=0');
    expect(output).toContain('latest_run=success:Library index applied.');
  });

  it('keeps sampling output readable when a point cannot read the device database', async () => {
    const result = await sampleSyncScenario(
      { atSeconds: [0] },
      async () => {
        throw new Error('No Android companion database was readable with run-as.');
      },
      async () => {}
    );

    expect(formatScenarioReport(result)).toContain('sample_failed=No Android companion database was readable with run-as.');
  });
});
