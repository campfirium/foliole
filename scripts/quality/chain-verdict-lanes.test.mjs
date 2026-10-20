// @vitest-environment node
import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  BASELINE_STAGES, CHAIN_STAGES, createChainVerdict, DEV_FULL_OMITTED_STAGES, fullChainStages,
  requestedStages, RELEASE_LANE, runChainCommand
} from './chain-verdict.mjs';
import { consumeChainVerdict } from './chain-verdict-read.mjs';

const targetSha = 'a'.repeat(40);
const needsFor = stages => Object.fromEntries(stages.map(stage => [stage, {
  result: 'success', outputs: { accepted_sha: targetSha }
}]));
const consume = receipt => consumeChainVerdict({
  targetSha,
  run: { id: 9, run_attempt: 1, status: 'completed', conclusion: 'success' },
  artifact: { id: 1, name: 'chain-verdict-9-1', expired: false, workflow_run: { id: 9 } },
  receipt
});

it('keeps the release full chain unchanged and omits duplicated or host stages from dev chains', () => {
  expect(fullChainStages(RELEASE_LANE)).toEqual(CHAIN_STAGES);
  expect(fullChainStages(undefined)).toEqual(CHAIN_STAGES);
  for (const lane of ['dev-remote', 'dev-t7']) {
    expect(requestedStages('all', lane)).toEqual(CHAIN_STAGES.filter(stage => !DEV_FULL_OMITTED_STAGES.includes(stage)));
  }
  expect(DEV_FULL_OMITTED_STAGES).toEqual([
    't5-desktop-static', 't6-windows-acceptance', 't6-ios-sync-group-content',
    't6-ios-state-writeback', 't6-ios-sync-pack', 't6-ios-foreground'
  ]);
  expect(requestedStages('all', 'dev-remote')).toContain('t6-ios-contract');
  expect(requestedStages('t6-windows-acceptance', 'dev-remote')).toEqual(['t6-windows-acceptance']);
});

it('accepts a dev full receipt without omitted stages but never a release receipt missing them', () => {
  const devStages = fullChainStages('dev-remote');
  const dev = createChainVerdict({ selection: 'all', targetSha, needs: needsFor(devStages),
    runId: 9, runAttempt: 1, lane: 'dev-remote' });
  expect(dev).toMatchObject({ lane: 'dev-remote', verdict: 'passed', accepted_sha: targetSha });
  expect(consume(dev).accepted_sha).toBe(targetSha);
  expect(consume({ ...dev, lane: RELEASE_LANE }).verdict).toBe('incomplete');
  const legacy = { ...dev };
  delete legacy.lane;
  expect(consume(legacy).verdict).toBe('incomplete');
});

it('still fails a dev chain when any remaining required stage fails', () => {
  const needs = needsFor(fullChainStages('dev-remote'));
  needs['t6-linux-responsiveness'].result = 'failure';
  expect(createChainVerdict({ selection: 'all', targetSha, needs, runId: 9, runAttempt: 1, lane: 'dev-t7' }))
    .toMatchObject({ verdict: 'failed' });
});

it('checks only the selected baseline stages for the lane', () => {
  const env = lane => ({ CHAIN_LANE: lane, TARGET_SHA: targetSha,
    CHAIN_NEEDS: JSON.stringify(needsFor(BASELINE_STAGES.filter(stage => stage !== 't5-desktop-static'))) });
  expect(() => runChainCommand('baseline', env('dev-remote'))).not.toThrow();
  expect(() => runChainCommand('baseline', env(RELEASE_LANE))).toThrow('Baseline did not accept');
});

it('starts dev tail stages with the baseline while release keeps the gate', () => {
  const workflow = fs.readFileSync('.github/workflows/t6-hosted-quality.yml', 'utf8');
  const gate = "(inputs.stages != 'all' || needs.baseline.result == 'success' || inputs.execution_lane != 'release-t7')";
  expect(workflow.split(gate).length - 1).toBe(10);
  expect(workflow).toContain('execution_lane: ${{ inputs.execution_lane }}\n      stages: ${{ inputs.stages }}');
  const dev = fs.readFileSync('.github/workflows/dev-quality-chain.yml', 'utf8');
  expect(dev).not.toContain('needs.baseline');
  expect(dev).toContain('execution_lane: ${{ inputs.execution_lane }}\n      stages: ${{ inputs.stages }}');
  const linux = fs.readFileSync('.github/workflows/hosted-quality-linux-responsiveness.yml', 'utf8');
  expect(linux).toContain("FOLIOLE_RESPONSIVENESS_SPEED_ADVISORY: ${{ startsWith(inputs.execution_lane, 'dev-') && '1' || '' }}");
});
