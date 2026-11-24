/* global console, process */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { RELEASE_LANE, fullChainStages } from './chain-verdict.mjs';
import { consumeChainVerdict, readChainEvidence } from './chain-verdict-read.mjs';
import { isTestOnlyFile } from './test-only-files.mjs';

// A release candidate may reuse a hosted full QA pass only when everything it adds on
// top of that exact commit is release-only content. Any doubt falls back to the full chain.
const FULL_SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^\d+$/u;
const INTENT_PATH = '.github/release-intent.json';
const RELEASE_WORKFLOW = '.github/workflows/t7-release.yml';
const FULL_RELEASE_TITLE = 'Release (full) @ ';
// Non-release full chains run the same stage set; the release lane adds only the stages
// in DEV_FULL_OMITTED_STAGES, of which only Windows acceptance is not already covered.
export const REUSABLE_QUALITY_SOURCES = [
  { path: '.github/workflows/remote-quality.yml', lanes: ['dev-remote', 'qa-mobile-beta'] },
  { path: '.github/workflows/t7-hosted-quality.yml', lanes: ['dev-t7'] }
];
const LOCALE_ROOT = 'src/shared/localization/locales/';
// English and Simplified Chinese sources are TypeScript; only generated JSON catalogs qualify.
const SOURCE_LOCALE_DIRECTORIES = new Set(['en', 'zh-Hans', 'zhHans']);

export function classifyReleasePath(file) {
  if (file === INTENT_PATH) return 'release';
  if (file.startsWith('docs/') || file.startsWith('releases/')) return 'release';
  if (file === 'package.json' || file === 'package-lock.json') return 'version';
  if (file.startsWith(LOCALE_ROOT) && file.endsWith('.json')) {
    const parts = file.slice(LOCALE_ROOT.length).split('/');
    if (parts.length === 2 && !SOURCE_LOCALE_DIRECTORIES.has(parts[0])) return 'localization';
  }
  return 'other';
}

function withoutVersion(file, text) {
  const value = JSON.parse(text);
  delete value.version;
  if (file === 'package-lock.json' && value.packages?.['']) delete value.packages[''].version;
  return JSON.stringify(value);
}

export function versionOnlyChange(file, before, after) {
  if (before === null || after === null) return false;
  try {
    return withoutVersion(file, before) === withoutVersion(file, after);
  } catch {
    return false;
  }
}

export function readQualityBaseline(intentText) {
  const baseline = JSON.parse(intentText).qualityBaseline;
  if (baseline === undefined) return null;
  if (!RUN_ID.test(String(baseline?.runId ?? '')) || !FULL_SHA.test(baseline?.sha ?? '')) {
    throw new Error('release intent qualityBaseline must name a run ID and a full commit SHA');
  }
  return { runId: String(baseline.runId), sha: baseline.sha };
}

export function evaluateBaselineEvidence({ evidence, baseline, repository }) {
  const { run } = evidence;
  const source = REUSABLE_QUALITY_SOURCES.find(item => item.path === run?.path);
  if (!source) return 'baseline run is not a hosted QA full chain workflow';
  if (run.repository?.full_name !== repository) return 'baseline run belongs to another repository';
  if (run.head_sha !== baseline.sha) return 'baseline run tested a different commit';
  const verdict = consumeChainVerdict({ ...evidence, targetSha: baseline.sha });
  if (verdict.verdict !== 'passed' || verdict.kind !== 'full' || verdict.accepted_sha !== baseline.sha) {
    return 'baseline run has no passing full chain verdict for that commit';
  }
  if (!source.lanes.includes(verdict.lane)) return 'baseline verdict lane is not reusable';
  return null;
}

/** Decide whether the release candidate may reuse a passed QA full chain. */
export function decideQualityReuse({ baseline, isAncestor, changes, readAt, evidence, repository }) {
  const no = reason => ({ reuse: false, reason, localizationChanged: false });
  if (!baseline) return no('release intent names no quality baseline');
  if (!isAncestor) return no('quality baseline is not an ancestor of the release candidate');
  let localizationChanged = false;
  const blocked = [];
  for (const { status, file } of changes) {
    const kind = classifyReleasePath(file);
    if (kind === 'localization') localizationChanged = true;
    else if (kind === 'version') {
      if (status !== 'M' || !versionOnlyChange(file, readAt('base', file), readAt('target', file))) blocked.push(file);
    } else if (kind !== 'release') blocked.push(file);
  }
  if (blocked.length) {
    return no(`candidate changes more than release content: ${blocked.slice(0, 5).join(', ')}${blocked.length > 5 ? ', …' : ''}`);
  }
  const evidenceProblem = evaluateBaselineEvidence({ evidence: evidence(), baseline, repository });
  if (evidenceProblem) return no(evidenceProblem);
  return { reuse: true, reason: `reuses QA run ${baseline.runId} at ${baseline.sha}`, localizationChanged };
}

/**
 * Picks the previous full release chain: the newest completed push or full dispatch of the
 * release workflow on the release branch that started before this run and tested another commit.
 */
export function selectPreviousReleaseRun(runs, { currentRunId, targetSha }) {
  return runs
    .filter(run => run.path === RELEASE_WORKFLOW && run.head_branch === 'release' && run.status === 'completed'
      && String(run.display_title ?? '').startsWith(FULL_RELEASE_TITLE)
      && Number(run.id) < Number(currentRunId) && run.head_sha !== targetSha)
    .sort((left, right) => Number(right.id) - Number(left.id))[0] ?? null;
}

/**
 * Decides whether a failed release chain can be repaired by rerunning only its unpassed stages.
 * The previous release run must hold a trusted full release-lane verdict that failed, and every
 * commit a passed stage was accepted at must differ from the candidate only in test files.
 */
export function decideTestRepair({ evidence, repository, targetSha, isAncestor, changedFiles }) {
  const no = reason => ({ repair: false, reason });
  const { run } = evidence;
  if (!run) return no('no previous full release run');
  if (run.path !== RELEASE_WORKFLOW || run.head_branch !== 'release') return no('previous run is not a release chain');
  if (run.repository?.full_name !== repository) return no('previous release run belongs to another repository');
  const baseSha = run.head_sha;
  if (!FULL_SHA.test(baseSha ?? '')) return no('previous release run has no exact commit');
  const verdict = consumeChainVerdict({ ...evidence, targetSha: baseSha });
  if (verdict.kind !== 'full' || verdict.lane !== RELEASE_LANE) {
    return no(`previous release run ${run.id} has no trusted full release verdict`);
  }
  if (verdict.verdict !== 'failed') return no(`previous release run ${run.id} verdict is ${verdict.verdict}, not a failed chain`);
  const reusedFrom = verdict.reused?.stages ?? {};
  const stages = {};
  for (const stage of fullChainStages(RELEASE_LANE)) {
    if (verdict.stages[stage] !== 'success') continue;
    const sha = verdict.stage_shas[stage];
    if (sha === (reusedFrom[stage] ?? baseSha)) stages[stage] = sha;
  }
  if (!Object.keys(stages).length) return no(`previous release run ${run.id} passed no stage to reuse`);
  const origins = [...new Set([baseSha, ...Object.values(stages)])];
  for (const sha of origins) {
    if (!isAncestor(sha, targetSha)) return no(`reused commit ${sha} is not an ancestor of the release candidate`);
    const product = changedFiles(sha, targetSha).filter(file => !isTestOnlyFile(file));
    if (product.length) {
      return no(`candidate changes more than tests since ${sha.slice(0, 9)}: ${product.slice(0, 5).join(', ')}${product.length > 5 ? ', …' : ''}`);
    }
  }
  const changed = changedFiles(baseSha, targetSha);
  if (!changed.length) return no('candidate does not change the previous release run');
  const rerun = fullChainStages(RELEASE_LANE).filter(stage => !(stage in stages));
  return {
    repair: true,
    stages: rerun,
    reuse: { run_id: String(run.id), run_attempt: run.run_attempt, sha: baseSha, changed_files: changed, stages },
    reason: `test repair of release run ${run.id} at ${baseSha}: reruns ${rerun.join(', ')}; reuses ${Object.keys(stages).join(', ')}`
  };
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function readAtRevision(cwd, revision, file) {
  try {
    return git(cwd, 'show', `${revision}:${file}`);
  } catch {
    return null;
  }
}

function ghApi(endpoint) {
  return execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function listReleaseRuns({ repository, api = ghApi }) {
  const query = 'branch=release&status=completed&per_page=30';
  return JSON.parse(api(`repos/${repository}/actions/workflows/t7-release.yml/runs?${query}`)).workflow_runs ?? [];
}

/** Test-repair path: only when the release intent baseline did not already cover the candidate. */
export function runReleaseTestRepair({ cwd = process.cwd(), env = process.env, readEvidence = readChainEvidence,
  listRuns = listReleaseRuns } = {}) {
  const targetSha = env.TARGET_SHA ?? '';
  if (!FULL_SHA.test(targetSha)) throw new Error('TARGET_SHA must be a full commit SHA');
  const repository = env.GITHUB_REPOSITORY;
  const previous = selectPreviousReleaseRun(listRuns({ repository }), { currentRunId: env.GITHUB_RUN_ID, targetSha });
  if (!previous) return { repair: false, reason: 'no previous full release run' };
  return decideTestRepair({
    evidence: readEvidence({ repository, runId: previous.id }), repository, targetSha,
    isAncestor: (ancestor, descendant) => {
      try {
        git(cwd, 'merge-base', '--is-ancestor', ancestor, descendant);
        return true;
      } catch {
        return false;
      }
    },
    changedFiles: (from, to) => git(cwd, 'diff', '--name-only', '--no-renames', from, to).split('\n').filter(Boolean)
  });
}

export function runReleaseQualityReuse({ cwd = process.cwd(), env = process.env, readEvidence = readChainEvidence } = {}) {
  const targetSha = env.TARGET_SHA ?? '';
  if (!FULL_SHA.test(targetSha)) throw new Error('TARGET_SHA must be a full commit SHA');
  const baseline = readQualityBaseline(git(cwd, 'show', `${targetSha}:${INTENT_PATH}`));
  if (!baseline) return decideQualityReuse({ baseline });
  let isAncestor = false;
  try {
    git(cwd, 'merge-base', '--is-ancestor', baseline.sha, targetSha);
    isAncestor = true;
  } catch { /* not an ancestor or unknown commit */ }
  const changes = isAncestor
    ? git(cwd, 'diff', '--name-status', '--no-renames', baseline.sha, targetSha).split('\n').filter(Boolean)
      .map(line => { const [status, file] = line.split('\t'); return { status, file }; })
    : [];
  return decideQualityReuse({
    baseline, isAncestor, changes, repository: env.GITHUB_REPOSITORY,
    readAt: (side, file) => readAtRevision(cwd, side === 'base' ? baseline.sha : targetSha, file),
    evidence: () => readEvidence({ repository: env.GITHUB_REPOSITORY, runId: baseline.runId })
  });
}

function summaryLines(decision, repair) {
  if (decision.reuse) return [`Reused QA baseline: ${decision.reason}`];
  if (!repair.repair) return [`Full chain required: ${decision.reason}`, `Test repair not used: ${repair.reason}`];
  return [
    `Test repair: ${repair.reason}`, '',
    `- Previous release run: ${repair.reuse.run_id} (attempt ${repair.reuse.run_attempt}) at \`${repair.reuse.sha}\``,
    `- Changed since then (test files only): ${repair.reuse.changed_files.map(file => `\`${file}\``).join(', ')}`,
    `- Rerun stages: ${repair.stages.join(', ')}`,
    ...Object.entries(repair.reuse.stages).map(([stage, sha]) => `- Reused \`${stage}\` accepted at \`${sha}\``)
  ];
}

function main() {
  let decision;
  try {
    decision = runReleaseQualityReuse();
  } catch (error) {
    // Never block a release on the shortcut itself; the full chain stays the fallback.
    decision = { reuse: false, reason: `reuse check failed: ${error.message}`, localizationChanged: false };
  }
  let repair = { repair: false, reason: 'QA baseline reuse applies' };
  if (!decision.reuse) {
    try {
      repair = runReleaseTestRepair();
    } catch (error) {
      repair = { repair: false, reason: `test repair check failed: ${error.message}` };
    }
  }
  const lines = [`reuse=${decision.reuse}`, `localization_changed=${decision.localizationChanged}`,
    `accepted_sha=${decision.reuse ? process.env.TARGET_SHA : ''}`, `reason=${decision.reason.replaceAll('\n', ' ')}`,
    `repair=${repair.repair}`, `repair_stages=${repair.repair ? repair.stages.join(',') : ''}`,
    `repair_reuse=${repair.repair ? JSON.stringify(repair.reuse) : ''}`,
    `repair_reason=${repair.reason.replaceAll('\n', ' ')}`];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Release quality reuse\n\n${summaryLines(decision, repair).join('\n')}\n`);
  }
  console.log(`[release-quality-reuse] ${decision.reuse ? 'reuse' : repair.repair ? 'test repair' : 'full chain'}: ${
    decision.reuse ? decision.reason : repair.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
