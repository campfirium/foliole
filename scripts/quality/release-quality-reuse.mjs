/* global console, process */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { consumeChainVerdict, readChainEvidence } from './chain-verdict-read.mjs';

// A release candidate may reuse a hosted full QA pass only when everything it adds on
// top of that exact commit is release-only content. Any doubt falls back to the full chain.
const FULL_SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^\d+$/u;
const INTENT_PATH = '.github/release-intent.json';
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

function main() {
  let decision;
  try {
    decision = runReleaseQualityReuse();
  } catch (error) {
    // Never block a release on the shortcut itself; the full chain stays the fallback.
    decision = { reuse: false, reason: `reuse check failed: ${error.message}`, localizationChanged: false };
  }
  const lines = [`reuse=${decision.reuse}`, `localization_changed=${decision.localizationChanged}`,
    `accepted_sha=${decision.reuse ? process.env.TARGET_SHA : ''}`, `reason=${decision.reason.replaceAll('\n', ' ')}`];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Release quality reuse\n\n${decision.reuse
      ? 'Reused' : 'Full chain required'}: ${decision.reason}\n`);
  }
  console.log(`[release-quality-reuse] ${decision.reuse ? 'reuse' : 'full chain'}: ${decision.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
