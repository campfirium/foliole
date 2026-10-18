// @vitest-environment node
import { expect, it } from 'vitest';
import { CHAIN_STAGES, createChainVerdict } from './chain-verdict.mjs';
import { consumeChainVerdict, readChainVerdict } from './chain-verdict-read.mjs';

const targetSha = 'a'.repeat(40);
function fixture() {
  const needs = Object.fromEntries(CHAIN_STAGES.map(stage => [stage, {
    result: 'success', outputs: { accepted_sha: targetSha }
  }]));
  return {
    targetSha,
    run: { id: 123, run_attempt: 2, status: 'completed', conclusion: 'success' },
    artifact: { id: 456, name: 'chain-verdict-123-2', expired: false, workflow_run: { id: 123 } },
    receipt: createChainVerdict({ selection: 'all', targetSha, needs, runId: 123, runAttempt: 2 })
  };
}

it('trusts only the latest completed matching run receipt', () => {
  const value = fixture();
  expect(consumeChainVerdict(value).accepted_sha).toBe(targetSha);
});

it.each([
  ['cancelled', value => { value.run.conclusion = 'cancelled'; }],
  ['timeout', value => { value.run.conclusion = 'timed_out'; }],
  ['failed run with passing artifact', value => { value.run.conclusion = 'failure'; }],
  ['running', value => { value.run.status = 'in_progress'; }],
  ['old attempt', value => { value.receipt.run_attempt = 1; }],
  ['old artifact', value => { value.artifact.name = 'chain-verdict-123-1'; }],
  ['different run', value => { value.receipt.run_id = '124'; }],
  ['wrong artifact owner', value => { value.artifact.workflow_run.id = 124; }],
  ['missing accepted SHA', value => { delete value.receipt.accepted_sha; }],
  ['wrong target', value => { value.receipt.target_sha = 'b'.repeat(40); }],
  ['expired artifact', value => { value.artifact.expired = true; }],
  ['missing artifact', value => { value.artifact = undefined; }],
  ['missing stage', value => { delete value.receipt.stages['t5-static']; }],
  ['wrong stage SHA', value => { value.receipt.stage_shas['t5-static'] = 'b'.repeat(40); }]
])('does not trust %s', (_, mutate) => {
  const value = fixture();
  mutate(value);
  expect(consumeChainVerdict(value)).toEqual({ verdict: 'incomplete' });
});

it('never trusts accepted_sha from a partial chain', () => {
  const value = fixture();
  value.receipt.kind = 'replay';
  expect(consumeChainVerdict(value)).not.toHaveProperty('accepted_sha');
});

it('preserves failed full receipts without claiming successful acceptance', () => {
  const value = fixture();
  value.run.conclusion = 'failure';
  value.receipt.verdict = 'failed';
  value.receipt.stages['t5-electron'] = 'failure';
  expect(consumeChainVerdict(value)).toMatchObject({ kind: 'full', verdict: 'failed' });
  expect(consumeChainVerdict(value)).not.toHaveProperty('accepted_sha');
});

it.each([false, true])('reads artifacts by run and latest attempt, rerun during read=%s', rerun => {
  const value = fixture();
  let reads = 0;
  const api = endpoint => {
    if (endpoint.endsWith('/runs/123')) {
      reads += 1;
      return JSON.stringify(reads > 1 && rerun ? { ...value.run, run_attempt: 3 } : value.run);
    }
    if (endpoint.endsWith('/artifacts?name=chain-verdict-123-2&per_page=100')) {
      return JSON.stringify({ artifacts: [value.artifact] });
    }
    expect(endpoint).toBe('repos/owner/repo/actions/artifacts/456/zip');
    return value.receipt;
  };
  const result = readChainVerdict({ repository: 'owner/repo', runId: 123,
    targetSha, api, decode: receipt => receipt });
  expect(result.accepted_sha).toBe(rerun ? undefined : targetSha);
  expect(reads).toBe(2);
});
