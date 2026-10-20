// @vitest-environment node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { expect, it } from 'vitest';
import { parse } from 'yaml';
import { BASELINE_STAGES, CHAIN_STAGES, TAIL_STAGES } from './chain-verdict.mjs';

const workflow = name => parse(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const chain = workflow('t6-hosted-quality');
const summary = workflow('hosted-quality-chain-verdict').jobs.verdict;

it('routes dev entries to the dev chain and release entries to the gated chain', () => {
  for (const [name, key] of [['remote-quality', 'full-quality'], ['t7-hosted-quality', 't6_quality']]) {
    expect(workflow(name).jobs[key].uses).toBe('./.github/workflows/dev-quality-chain.yml');
  }
  for (const [name, key] of [['t7-release', 't6_quality'], ['release-quality-recheck', 'chain']]) {
    expect(workflow(name).jobs[key].uses).toBe('./.github/workflows/t6-hosted-quality.yml');
  }
  expect(chain.on.workflow_call.inputs.stages.default).toBe('all');
  expect(workflow('release-quality-recheck').jobs.chain.with.stages).toBe('${{ inputs.stage }}');
  const releaseStages = workflow('t7-release').on.workflow_dispatch.inputs.stage.options
    .filter(stage => /^t[56]-/u.test(stage));
  expect(CHAIN_STAGES).toEqual(releaseStages);
  expect(Object.keys(chain.jobs).filter(key => /^t[56]-/u.test(key))).toEqual(CHAIN_STAGES);
});

it('blocks every full tail stage until all baseline stages accepted the exact SHA', () => {
  const gate = chain.jobs.baseline;
  expect(gate.needs).toEqual(BASELINE_STAGES);
  const command = gate.steps.at(-1);
  expect(command.env.CHAIN_NEEDS).toBe('${{ toJSON(needs) }}');
  const sha = 'a'.repeat(40);
  const needs = Object.fromEntries(BASELINE_STAGES.map(stage => [stage, {
    result: 'success', outputs: { accepted_sha: sha }
  }]));
  for (const failure of [false, true]) {
    needs['t5-electron'].result = failure ? 'failure' : 'success';
    const result = spawnSync(process.execPath, command.run.split(' ').slice(1), {
      env: { ...process.env, TARGET_SHA: sha, CHAIN_NEEDS: JSON.stringify(needs) }
    });
    expect(result.status).toBe(failure ? 1 : 0);
  }
  for (const stage of TAIL_STAGES) {
    expect(chain.jobs[stage].needs).toContain('baseline');
    expect(chain.jobs[stage].if).toContain("inputs.stages != 'all' || needs.baseline.result == 'success'");
    expect(chain.jobs[stage].if).toContain('!cancelled()');
  }
});

it('publishes the verdict before failing a non-passing chain, even after dependency failure', () => {
  const admission = chain.jobs['quality-admission'];
  expect(admission.if).toBe('${{ always() }}');
  expect(admission.needs).toEqual(expect.arrayContaining(CHAIN_STAGES));
  expect(admission.with.stage_results).toBe('${{ toJSON(needs) }}');
  const upload = summary.steps.findIndex(step => step.uses === 'actions/upload-artifact@v4');
  expect(upload).toBeGreaterThan(summary.steps.findIndex(step => step.id === 'verdict'));
  expect(upload).toBeLessThan(summary.steps.length - 1);
  expect(summary.steps[upload].with.name).toBe('chain-verdict-${{ github.run_id }}-${{ github.run_attempt }}');
  for (const verdict of ['passed', 'failed', 'incomplete', '']) {
    const result = spawnSync('bash', ['-c', summary.steps.at(-1).run], {
      env: { ...process.env, VERDICT: verdict }
    });
    expect(result.status).toBe(verdict === 'passed' ? 0 : 1);
  }
});

it('gets a SHA from every leaf and binds leaf inputs to the chain target', () => {
  for (const stage of CHAIN_STAGES) {
    const job = chain.jobs[stage];
    const leaf = parse(fs.readFileSync(job.uses, 'utf8'));
    expect(leaf.on.workflow_call.outputs.accepted_sha.value).toContain('outputs.accepted_sha');
    expect(job.with.target_sha).toBe('${{ inputs.target_sha }}');
    expect(job.with.execution_lane).toBe('${{ inputs.execution_lane }}');
    expect(job.with.trigger_ref).toBe('${{ inputs.trigger_ref }}');
    expect(job['continue-on-error']).toBeUndefined();
  }
});

it('preserves all iOS simulator scenarios when splitting them into stable stages', () => {
  const ios = workflow('hosted-quality-ios');
  const expected = JSON.parse(ios.on.workflow_call.inputs.simulator_matrix.default);
  const actual = TAIL_STAGES.filter(stage => stage.startsWith('t6-ios-') && stage !== 't6-ios-contract')
    .flatMap(stage => JSON.parse(chain.jobs[stage].with.simulator_matrix));
  expect(actual).toEqual(expected);
  expect(chain.jobs['t6-ios-contract'].with).toMatchObject({ run_contract: true, run_simulator: false });
});

it('keeps each entry within reusable workflow limits without expanding leaf permissions', () => {
  const visit = (name, ancestors, seen) => {
    expect(ancestors).not.toContain(name);
    expect(ancestors.length + 1).toBeLessThanOrEqual(10);
    const current = workflow(name);
    for (const job of Object.values(current.jobs)) {
      if (!job.uses?.startsWith('./.github/workflows/')) continue;
      const child = job.uses.split('/').at(-1).replace('.yml', '');
      seen.add(child);
      visit(child, [...ancestors, name], seen);
    }
  };
  for (const entry of ['remote-quality', 't7-hosted-quality', 't7-release', 'release-quality-recheck']) {
    const seen = new Set();
    visit(entry, [], seen);
    expect(seen.size).toBeLessThanOrEqual(50);
  }
  expect(chain.permissions).toEqual({ contents: 'read' });
  for (const stage of CHAIN_STAGES) {
    const leaf = parse(fs.readFileSync(chain.jobs[stage].uses, 'utf8'));
    expect(leaf.permissions).toEqual({ contents: 'read' });
  }
});

it('routes replay through the shared chain and prevents all from minting full evidence', () => {
  const remote = workflow('remote-quality');
  expect(remote.on.workflow_dispatch.inputs.scope.options).toContain('replay');
  expect(remote.jobs['scoped-quality'].if).toContain("inputs.scope != 'replay'");
  expect(remote.jobs['full-quality'].if).toContain("inputs.scope == 'replay'");
  expect(remote.jobs['full-quality'].with.stages)
    .toBe("${{ inputs.scope == 'replay' && inputs.stages || 'all' }}");
  const guard = remote.jobs['dev-ref'].steps.find(step => step.env?.STAGES);
  expect(guard.if).toBe("inputs.scope == 'replay'");
  for (const selection of ['', 'all', 't6-ios-contract']) {
    expect(spawnSync('bash', ['-c', guard.run], {
      env: { ...process.env, STAGES: selection }
    }).status).toBe(selection === 't6-ios-contract' ? 0 : 1);
  }
});

it('runs a selected tail despite skipped baseline and keeps Windows build preparation', () => {
  const selection = ['t6-ios-contract'];
  for (const stage of TAIL_STAGES) {
    const expression = chain.jobs[stage].if.slice(3, -3)
      .replaceAll('!cancelled()', 'true')
      .replaceAll("needs.context.result", "'success'")
      .replaceAll('fromJSON(needs.context.outputs.stages)', JSON.stringify(selection))
      .replaceAll('contains(', 'includes(')
      .replaceAll('inputs.stages', "'t6-ios-contract'")
      .replaceAll('needs.baseline.result', "'skipped'");
    const evaluate = new Function('includes', `return (${expression});`);
    expect(evaluate((values, value) => values.includes(value))).toBe(stage === 't6-ios-contract');
  }
  const steps = workflow('hosted-quality-windows-acceptance').jobs['windows-acceptance'].steps;
  expect(steps.find(step => step.id === 'desktop_build').run).toContain('npm run build:vite-only');
  expect(steps.find(step => step.id === 'windows_tail').if).toContain("steps.desktop_build.outcome == 'success'");
});
