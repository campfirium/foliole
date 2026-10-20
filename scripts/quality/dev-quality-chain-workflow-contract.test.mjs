// @vitest-environment node
import fs from 'node:fs';

import { expect, it } from 'vitest';
import { parse } from 'yaml';

import { CHAIN_STAGES, fullChainStages } from './chain-verdict.mjs';
import { portableDomainHosts } from './portable-domain-hosts.test-support.mjs';

const workflow = name => parse(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const gated = workflow('t6-hosted-quality');
const dev = workflow('dev-quality-chain');
const GATE = " && (inputs.stages != 'all' || needs.baseline.result == 'success' || inputs.execution_lane != 'release-t7')";
const HOSTED_JOB_LIMIT = 20;
const MACOS_JOB_LIMIT = 5;

// Runner-backed leaf jobs one stage starts at once; stage admission jobs run only after them.
function leafJobs(stage) {
  const call = dev.jobs[stage];
  const leaf = parse(fs.readFileSync(call.uses, 'utf8'));
  if (call.uses.endsWith('hosted-quality-portable-domain.yml')) {
    return portableDomainHosts(leaf, call.with.domain).map(() => 'linux-or-windows');
  }
  if (call.uses.endsWith('hosted-quality-ios.yml')) {
    expect(Object.keys(leaf.jobs)).toEqual(['contract', 'app-compile', 'simulator']);
    expect(leaf.jobs.contract.if).toBe('inputs.run_contract');
    expect(leaf.jobs['app-compile'].if).toBe("inputs.run_contract && inputs.scope == 'full'");
    expect(leaf.jobs.simulator.if).toBe("inputs.scope == 'full' && inputs.run_simulator");
    const { run_contract: contract, run_simulator: simulator, scope } = call.with;
    const count = (contract ? 1 : 0) + (contract && scope === 'full' ? 1 : 0)
      + (simulator !== false && scope === 'full' ? JSON.parse(call.with.simulator_matrix).length : 0);
    return Array(count).fill('macos');
  }
  return Object.entries(leaf.jobs).filter(([key]) => !key.includes('admission')).flatMap(([, job]) => {
    const include = job.strategy?.matrix?.include;
    expect(include === undefined || Array.isArray(include)).toBe(true);
    return (include ?? [job]).map(entry => String(entry.runner ?? job['runs-on']));
  });
}

const predecessor = stage => dev.jobs[stage].needs.filter(need => need !== 'context');

it('routes dev entries to the dev chain while release entries keep the gated chain', () => {
  expect(workflow('remote-quality').jobs['full-quality'].uses).toBe('./.github/workflows/dev-quality-chain.yml');
  expect(workflow('t7-hosted-quality').jobs.t6_quality.uses).toBe('./.github/workflows/dev-quality-chain.yml');
  expect(workflow('t7-release').jobs.t6_quality.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
  expect(workflow('release-quality-recheck').jobs.chain.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
  expect(dev.jobs.context.steps.find(step => step.name === 'Require a dev lane').if)
    .toBe("${{ !startsWith(inputs.execution_lane, 'dev-') }}");
});

it('keeps every dev stage leaf identical to the gated chain without a baseline gate', () => {
  expect(Object.keys(dev.jobs).filter(key => /^t[56]-/u.test(key))).toEqual(CHAIN_STAGES);
  expect(dev.jobs.baseline).toBeUndefined();
  expect(dev.on.workflow_call.inputs).toEqual(gated.on.workflow_call.inputs);
  expect(dev.permissions).toEqual(gated.permissions);
  for (const stage of CHAIN_STAGES) {
    expect(dev.jobs[stage].needs[0]).toBe('context');
    expect(predecessor(stage).length).toBeLessThanOrEqual(1);
    expect(dev.jobs[stage].uses).toBe(gated.jobs[stage].uses);
    expect(dev.jobs[stage].with).toEqual(gated.jobs[stage].with);
    expect(dev.jobs[stage].if).toBe(gated.jobs[stage].if.replace(GATE, ''));
    expect(dev.jobs[stage].if).toContain('!cancelled()');
    expect(dev.jobs[stage].if).not.toContain('needs.baseline');
  }
  const admission = dev.jobs['quality-admission'];
  expect(admission.needs).toEqual(['context', ...CHAIN_STAGES]);
  expect(admission.with).toEqual(gated.jobs['quality-admission'].with);
  expect(admission.if).toBe('${{ always() }}');
});

it('keeps a dev full run within the free hosted job concurrency', () => {
  for (const lane of ['dev-remote', 'dev-t7']) {
    const stages = fullChainStages(lane);
    const leaves = Object.fromEntries(stages.map(stage => [stage, leafJobs(stage)]));
    const starters = stages.filter(stage => predecessor(stage).length === 0);
    const startJobs = starters.flatMap(stage => leaves[stage]);
    expect(startJobs.length).toBeLessThanOrEqual(HOSTED_JOB_LIMIT);
    expect(startJobs.filter(runner => runner.startsWith('macos')).length).toBeLessThanOrEqual(MACOS_JOB_LIMIT);
    const released = Object.fromEntries(stages.map(stage => [stage, leaves[stage].length]));
    for (const stage of stages.filter(item => !starters.includes(item))) {
      const [before] = predecessor(stage);
      expect(stages).toContain(before);
      released[before] -= leaves[stage].length;
      expect(released[before]).toBeGreaterThanOrEqual(0);
    }
  }
});
