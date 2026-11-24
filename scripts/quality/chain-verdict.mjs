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
  't6-ios-sync-group-content', 't6-ios-state-writeback', 't6-ios-sync-pack'
];
export const CHAIN_STAGES = [...BASELINE_STAGES, ...TAIL_STAGES];
// Dev full chains omit duplicated stages and host journeys verified as local acceptance;
// they remain selectable explicitly, and release chains still run them. iOS Simulator
// buckets count in dev full so every platform's result gates dev.
export const DEV_FULL_OMITTED_STAGES = ['t5-desktop-static', 't6-windows-acceptance'];
export const RELEASE_LANE = 'release-t7';

export function fullChainStages(lane) {
  if (!lane || lane === RELEASE_LANE) return [...CHAIN_STAGES];
  return CHAIN_STAGES.filter(stage => !DEV_FULL_OMITTED_STAGES.includes(stage));
}

export function requestedStages(input, lane) {
  if (input === 'all') return fullChainStages(lane);
  const stages = input.split(',').map(stage => stage.trim());
  if (!stages.length || stages.some(stage => !CHAIN_STAGES.includes(stage))) {
    throw new Error('Unknown or empty chain stage selection');
  }
  return [...new Set(stages)];
}

// A reused stage passed at its recorded ancestor SHA; every other stage must accept the target.
export function stagesVerdict(stages, needs, targetSha, reusedShas = {}) {
  const results = stages.map(stage => needs[stage]?.result);
  if (results.includes('failure')) return 'failed';
  if (results.some(result => result !== 'success')) return 'incomplete';
  return stages.every(stage => needs[stage]?.outputs?.accepted_sha === (reusedShas[stage] ?? targetSha))
    ? 'passed' : 'failed';
}

const FULL_SHA = /^[0-9a-f]{40}$/u;

/**
 * Validates a release test-repair reuse record: stages a failed release chain already passed at
 * an ancestor that differs from the target only in test files. Only the release lane may carry it,
 * and the reused and rerun stages must partition the full release chain.
 */
export function validateChainReuse(reuse, { lane, targetSha, rerunStages }) {
  if (lane !== RELEASE_LANE) throw new Error('Only the release lane may reuse stages');
  if (!/^\d+$/u.test(String(reuse?.run_id ?? '')) || !Number.isSafeInteger(reuse?.run_attempt)
    || !FULL_SHA.test(reuse?.sha ?? '') || reuse.sha === targetSha || !Array.isArray(reuse.changed_files)) {
    throw new Error('Reuse must name the failed release run, its attempt and its exact SHA');
  }
  const reused = Object.entries(reuse.stages ?? {});
  if (!reused.length || reused.some(([stage, sha]) => !CHAIN_STAGES.includes(stage) || !FULL_SHA.test(sha) || sha === targetSha)) {
    throw new Error('Reused stages must be chain stages accepted at an exact ancestor SHA');
  }
  if (rerunStages) {
    const full = fullChainStages(lane);
    const covered = [...rerunStages, ...reused.map(([stage]) => stage)];
    if (!rerunStages.length || new Set(covered).size !== covered.length || covered.length !== full.length
      || full.some(stage => !covered.includes(stage))) {
      throw new Error('Reused and rerun stages must partition the full release chain');
    }
  }
  return Object.fromEntries(reused);
}

function parseReuse(text) {
  return text ? JSON.parse(text) : null;
}

export function createChainVerdict({ selection, targetSha, needs, runId, runAttempt, lane, reuse = null }) {
  if (!FULL_SHA.test(targetSha)) throw new Error('Chain target must be an exact SHA');
  const rerun = requestedStages(selection, lane);
  let requested = rerun;
  let reusedShas = {};
  let merged = needs;
  if (reuse) {
    if (selection === 'all') throw new Error('A reusing chain reruns an explicit stage list');
    reusedShas = validateChainReuse(reuse, { lane, targetSha, rerunStages: rerun });
    requested = fullChainStages(lane);
    merged = { ...needs, ...Object.fromEntries(Object.entries(reusedShas).map(([stage, sha]) =>
      [stage, { result: 'success', outputs: { accepted_sha: sha } }])) };
  }
  const verdict = stagesVerdict(requested, merged, targetSha, reusedShas);
  const receipt = {
    run_id: String(runId), run_attempt: Number(runAttempt),
    kind: selection === 'all' || reuse ? 'full' : 'replay', target_sha: targetSha,
    ...(lane ? { lane } : {}),
    stages: Object.fromEntries(requested.map(stage => [stage, merged[stage]?.result ?? 'skipped'])),
    stage_shas: Object.fromEntries(requested.map(stage => [stage, merged[stage]?.outputs?.accepted_sha ?? ''])),
    ...(reuse ? { reused: reuse } : {}),
    verdict
  };
  if (receipt.kind === 'full' && verdict === 'passed') receipt.accepted_sha = targetSha;
  return receipt;
}

export function runChainCommand(command, env = process.env) {
  const selection = env.CHAIN_STAGES;
  const needs = JSON.parse(env.CHAIN_NEEDS ?? '{}');
  const lane = env.CHAIN_LANE || undefined;
  const reuse = parseReuse(env.CHAIN_REUSE);
  if (command === 'select') {
    const stages = requestedStages(selection, lane);
    if (!FULL_SHA.test(env.TARGET_SHA)) throw new Error('Chain target must be an exact SHA');
    if (reuse) {
      if (selection === 'all') throw new Error('A reusing chain reruns an explicit stage list');
      validateChainReuse(reuse, { lane, targetSha: env.TARGET_SHA, rerunStages: stages });
    }
    appendFileSync(env.GITHUB_OUTPUT, `stages=${JSON.stringify(stages)}\n`);
    return;
  }
  if (command === 'baseline') {
    const baseline = BASELINE_STAGES.filter(stage => fullChainStages(lane).includes(stage));
    if (stagesVerdict(baseline, needs, env.TARGET_SHA) !== 'passed') {
      throw new Error('Baseline did not accept the target SHA');
    }
    return;
  }
  if (command !== 'write') throw new Error('Unknown chain command');
  const receipt = createChainVerdict({ selection, targetSha: env.TARGET_SHA, needs,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, lane, reuse });
  writeFileSync('chain-verdict.json', `${JSON.stringify(receipt, null, 2)}\n`);
  appendFileSync(env.GITHUB_OUTPUT, `verdict=${receipt.verdict}\n`);
  if (receipt.accepted_sha) appendFileSync(env.GITHUB_OUTPUT, `accepted_sha=${receipt.accepted_sha}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runChainCommand(process.argv[2]);
}
