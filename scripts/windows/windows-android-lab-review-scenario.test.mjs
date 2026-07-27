// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  finishWindowsAndroidLabReviewScenarioRun, reviewUiSequenceArgs, scenarioEnv, SCENARIO_UI_COMMAND_TIMEOUT_MS
} from './windows-android-lab-review-scenario.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'e'.repeat(40);

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-review-scenario-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  const request = { action: 'reviewScenario', commitSha: SHA, runId: '3000-eeeeeeeeeeee-scenario', schemaVersion: 1 };
  writeJsonAtomic(paths.active, request);
  return { paths, request };
}

describe('Windows Android Lab Review scenario run', () => {
  it('keeps the UI action wrapper timeout beyond the instrumentation build timeout', () => {
    expect(SCENARIO_UI_COMMAND_TIMEOUT_MS).toBeGreaterThan(25 * 60_000);
  });

  it('skips source sync when UI automation runs from the deployed preview workspace', () => {
    const env = scenarioEnv({
      adbPath: 'C:\\Android\\adb.exe', bashPath: 'bash.exe', nodeDirectory: 'C:\\node'
    }, 'A5', { preview: 'C:\\dev\\foliole-android-lab-preview', signingHome: 'C:\\signing' }, 'C:\\evidence');
    expect(env.ANDROID_SKIP_WINDOWS_SYNC).toBe('1');
    expect(env.ANDROID_WINDOWS_WORKDIR).toBe('C:\\dev\\foliole-android-lab-preview');
  });

  it('runs Review UI actions as one instrumentation sequence', () => {
    expect(reviewUiSequenceArgs([
      { testId: 'companion-review-action-reveal' },
      { testId: 'companion-review-grade-1' }
    ])).toContain('companion-review-action-reveal,companion-review-grade-1');
  });

  it('keeps the scenario as one worker-owned run and updates phase status', async () => {
    const { paths, request } = fixture();
    const phases = [];
    await finishWindowsAndroidLabReviewScenarioRun({
      executeCommand: async () => { throw new Error('scenario mock should own commands'); },
      paths,
      request,
      running: { ...request, evidenceRoot: path.join(paths.evidence, request.runId), state: 'running' },
      runScenario: async ({ setPhase }) => {
        setPhase('scenario_prepare');
        phases.push(readJson(paths.status).phase);
        writeJsonAtomic(path.join(paths.evidence, request.runId, 'summary.json'), {
          resultStatus: 'success', runId: request.runId, schemaVersion: 1
        });
      }
    });
    expect(phases).toEqual(['scenario_prepare']);
    expect(readJson(paths.status)).toMatchObject({ resultStatus: 'success', state: 'completed' });
    expect(fs.existsSync(paths.active)).toBe(false);
    expect(readJson(path.join(paths.evidence, request.runId, 'summary.json'))).toMatchObject({
      resultStatus: 'success', runId: request.runId
    });
  });

  it('writes a collectable scenario failure summary without deleting evidence', async () => {
    const { paths, request } = fixture();
    await expect(finishWindowsAndroidLabReviewScenarioRun({
      executeCommand: async () => { throw new Error('scenario mock should own commands'); },
      paths,
      request,
      running: { ...request, evidenceRoot: path.join(paths.evidence, request.runId), state: 'running' },
      runScenario: async () => {
        throw Object.assign(new Error('capture did not transition'), { code: 'review_fsrs_transition_missing' });
      }
    })).rejects.toMatchObject({ code: 'review_fsrs_transition_missing' });
    expect(readJson(path.join(paths.evidence, request.runId, 'summary.json'))).toMatchObject({
      errorCode: 'review_fsrs_transition_missing', resultStatus: 'failure', runId: request.runId
    });
    expect(readJson(paths.status)).toMatchObject({
      errorCode: 'review_fsrs_transition_missing', resultStatus: 'failure', state: 'completed'
    });
  });
});
