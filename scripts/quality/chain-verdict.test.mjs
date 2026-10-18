// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { BASELINE_STAGES, CHAIN_STAGES, createChainVerdict, requestedStages } from './chain-verdict.mjs';

const sha = 'a'.repeat(40);
const successful = () => Object.fromEntries(CHAIN_STAGES.map(stage => [stage, {
  result: 'success', outputs: { accepted_sha: sha }
}]));
const create = (needs, selection = 'all') => createChainVerdict({
  needs, selection, targetSha: sha, runId: '123', runAttempt: 2
});

it('accepts exactly the complete successful chain at one SHA', () => {
  expect(create(successful())).toMatchObject({ kind: 'full', verdict: 'passed', accepted_sha: sha });
  const replay = create(successful(), CHAIN_STAGES.join(','));
  expect(replay).toMatchObject({ kind: 'replay', verdict: 'passed' });
  expect(replay).not.toHaveProperty('accepted_sha');
});

it.each(CHAIN_STAGES)('rejects a mismatched successful SHA in %s', stage => {
  const needs = successful();
  needs[stage].outputs.accepted_sha = 'b'.repeat(40);
  expect(create(needs)).toMatchObject({ verdict: 'failed' });
  expect(create(needs)).not.toHaveProperty('accepted_sha');
});

it('records baseline failure even when the tail is skipped by its gate', () => {
  const needs = Object.fromEntries(BASELINE_STAGES.map(stage => [stage, successful()[stage]]));
  needs['t5-electron'].result = 'failure';
  const receipt = create(needs);
  expect(receipt.verdict).toBe('failed');
  expect(receipt.stages['t6-ios-contract']).toBe('skipped');
  expect(receipt).not.toHaveProperty('accepted_sha');
});

it.each(['cancelled', 'skipped', undefined])('marks an unfinished required stage %s incomplete', result => {
  const needs = successful();
  needs['t6-ios-contract'].result = result;
  expect(create(needs).verdict).toBe('incomplete');
});

it('rejects unknown and empty stage selections', () => {
  for (const input of ['', 't5-static,typo', 'all,t5-static']) {
    expect(() => requestedStages(input)).toThrow();
  }
});

it('writes a failed receipt before the workflow rejects its verdict', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'chain-write-test-'));
  try {
    const needs = successful();
    needs['t6-ios-contract'].outputs.accepted_sha = 'b'.repeat(40);
    const output = path.join(directory, 'output');
    const result = spawnSync(process.execPath, [path.resolve('scripts/quality/chain-verdict.mjs'), 'write'], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, CHAIN_NEEDS: JSON.stringify(needs),
        CHAIN_STAGES: 'all', TARGET_SHA: sha, GITHUB_OUTPUT: output,
        GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' }
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(path.join(directory, 'chain-verdict.json'), 'utf8')))
      .toMatchObject({ verdict: 'failed' });
    expect(readFileSync(output, 'utf8')).toBe('verdict=failed\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
