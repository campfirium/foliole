import { appendFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BASELINE_STAGES = [
  't5-static', 't5-desktop-static', 't5-dependency-hardening', 't5-windows-core',
  't5-shared', 't5-android-source', 't5-desktop-source', 't5-electron', 't5-tooling'
];
export const TAIL_STAGES = [
  't6-desktop-build', 't6-android-web-build', 't6-windows-acceptance',
  't6-linux-responsiveness', 't6-android-host', 't6-ios-contract',
  't6-ios-sync-group-content', 't6-ios-state-writeback', 't6-ios-sync-pack', 't6-ios-foreground'
];
export const CHAIN_STAGES = [...BASELINE_STAGES, ...TAIL_STAGES];

export function requestedStages(input) {
  if (input === 'all') return [...CHAIN_STAGES];
  const stages = input.split(',').map(stage => stage.trim());
  if (!stages.length || stages.some(stage => !CHAIN_STAGES.includes(stage))) {
    throw new Error('Unknown or empty chain stage selection');
  }
  return [...new Set(stages)];
}

export function stagesVerdict(stages, needs, targetSha) {
  const results = stages.map(stage => needs[stage]?.result);
  if (results.includes('failure')) return 'failed';
  if (results.some(result => result !== 'success')) return 'incomplete';
  return stages.every(stage => needs[stage]?.outputs?.accepted_sha === targetSha)
    ? 'passed' : 'failed';
}

export function createChainVerdict({ selection, targetSha, needs, runId, runAttempt }) {
  if (!/^[0-9a-f]{40}$/u.test(targetSha)) throw new Error('Chain target must be an exact SHA');
  const requested = requestedStages(selection);
  const verdict = stagesVerdict(requested, needs, targetSha);
  const receipt = {
    run_id: String(runId), run_attempt: Number(runAttempt),
    kind: selection === 'all' ? 'full' : 'replay', target_sha: targetSha,
    stages: Object.fromEntries(requested.map(stage => [stage, needs[stage]?.result ?? 'skipped'])),
    stage_shas: Object.fromEntries(requested.map(stage => [stage, needs[stage]?.outputs?.accepted_sha ?? ''])),
    verdict
  };
  if (receipt.kind === 'full' && verdict === 'passed') receipt.accepted_sha = targetSha;
  return receipt;
}

export function runChainCommand(command, env = process.env) {
  const selection = env.CHAIN_STAGES;
  const needs = JSON.parse(env.CHAIN_NEEDS ?? '{}');
  if (command === 'select') {
    const stages = requestedStages(selection);
    if (!/^[0-9a-f]{40}$/u.test(env.TARGET_SHA)) throw new Error('Chain target must be an exact SHA');
    appendFileSync(env.GITHUB_OUTPUT, `stages=${JSON.stringify(stages)}\n`);
    return;
  }
  if (command === 'baseline') {
    if (stagesVerdict(BASELINE_STAGES, needs, env.TARGET_SHA) !== 'passed') {
      throw new Error('Baseline did not accept the target SHA');
    }
    return;
  }
  if (command !== 'write') throw new Error('Unknown chain command');
  const receipt = createChainVerdict({ selection, targetSha: env.TARGET_SHA, needs,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT });
  writeFileSync('chain-verdict.json', `${JSON.stringify(receipt, null, 2)}\n`);
  appendFileSync(env.GITHUB_OUTPUT, `verdict=${receipt.verdict}\n`);
  if (receipt.accepted_sha) appendFileSync(env.GITHUB_OUTPUT, `accepted_sha=${receipt.accepted_sha}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runChainCommand(process.argv[2]);
}
