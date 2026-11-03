import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fullChainStages, stagesVerdict } from '../quality/chain-verdict.mjs';
import { parseRemoteQualityRun } from '../quality/remote-quality-run-title.mjs';

// Only this distribution boundary may differ from the fully tested source.
// Product inputs, dependencies and the original quality stage definitions remain exact.
export const MOBILE_DISTRIBUTION_REPAIR_PATHS = new Set([
  '.github/workflows/remote-quality.yml', '.github/workflows/release-ios.yml',
  'scripts/ios/testflight-archive.mjs', 'scripts/ios/testflight-contract.test.mjs',
  'scripts/ios/testflight-candidate.mjs', 'scripts/ios/testflight-release.md',
  'scripts/ios/testflight-workflow.test.mjs', 'scripts/ios/testflight-signature.mjs',
  'scripts/ios/mobile-beta-evidence.mjs', 'scripts/quality/mobile-beta-evidence.test.mjs',
  'scripts/ios/mobile-beta-evidence-read.mjs', 'scripts/quality/qa-mobile-resume.test.mjs',
  'scripts/quality/qa-mobile-resume.mjs', 'scripts/quality/qa-remote-quality.mjs',
  'scripts/quality/remote-quality-args.mjs', 'scripts/quality/remote-quality.test.mjs',
  'scripts/quality/remote-quality-run-title.mjs', 'scripts/quality/remote-quality-run-title.test.mjs',
  'scripts/quality/qa-workspace-integration.mjs', 'scripts/quality/qa-workspace-integration.test.mjs',
  'scripts/quality/qa-workspace-finish.mjs', 'scripts/quality/chain-verdict-read.mjs',
  'ios/AGENTS.md'
]);
const sha = /^[a-f0-9]{40}$/u;
const requireFact = (valid, reason) => { if (!valid) throw new Error(`Mobile quality reuse refused: ${reason}`); };

export function verifyMobileQualitySource({ run, artifact, receipt, jobs, repository }) {
  const identity = parseRemoteQualityRun(run);
  requireFact(run?.status === 'completed' && ['success', 'failure'].includes(run.conclusion), 'quality run is not a completed result');
  requireFact(run.head_branch === 'check' && run.event === 'workflow_dispatch' &&
    run.path === '.github/workflows/remote-quality.yml' && run.head_repository?.full_name === repository,
  'quality workflow or repository identity differs');
  requireFact(identity?.scope === 'full' && identity.mobileDistribution === 'ios' &&
    identity.testedSha === run.head_sha, 'not an exact full mobile QA source');
  requireFact(artifact && !artifact.expired && String(artifact.workflow_run?.id) === String(run.id) &&
    artifact.name === `chain-verdict-${run.id}-${run.run_attempt}`, 'missing, expired or mismatched quality artifact');
  requireFact(receipt?.kind === 'full' && String(receipt.run_id) === String(run.id) &&
    receipt.run_attempt === run.run_attempt && receipt.target_sha === run.head_sha &&
    receipt.accepted_sha === run.head_sha && receipt.verdict === 'passed' && receipt.lane === 'dev-remote',
  'quality receipt identity differs');
  const stages = fullChainStages('dev-remote');
  const needs = Object.fromEntries(stages.map(stage => [stage, {
    result: receipt.stages?.[stage], outputs: { accepted_sha: receipt.stage_shas?.[stage] }
  }]));
  requireFact(stagesVerdict(stages, needs, run.head_sha) === 'passed', 'full quality stages did not all accept the source');
  requireFact(jobs.some(job => job.name === 'full-quality / quality-admission / verdict' && job.conclusion === 'success'),
    'quality admission did not succeed');
  requireFact(jobs.every(job => ['success', 'skipped'].includes(job.conclusion) ||
    (job.name.startsWith('mobile-ios /') && job.conclusion === 'failure')), 'a non-distribution job failed or remains incomplete');
  const upload = jobs.find(job => job.name === 'mobile-ios / Sign and upload iPhone without waiting for Apple processing');
  const step = upload?.steps?.find(item => item.name === 'Upload the verified IPA and release the macOS runner');
  requireFact(upload?.conclusion === 'failure' && step?.conclusion === 'skipped',
    'upload already succeeded or is uncertain; inspect Apple and recover the original Linux continuation instead');
  return { qualitySourceSha: run.head_sha, qualityRunId: String(run.id), qualityRunAttempt: run.run_attempt,
    qualityArtifactId: artifact.id, qualityArtifactDigest: artifact.digest ?? null };
}

export function verifyUnchangedMobileProduct({ cwd, qualitySourceSha, sourceSha }) {
  requireFact(sha.test(qualitySourceSha) && sha.test(sourceSha), 'invalid candidate source');
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  git('merge-base', '--is-ancestor', qualitySourceSha, sourceSha);
  const changedPaths = git('diff', '--name-only', qualitySourceSha, sourceSha).split('\n').filter(Boolean);
  const unsupported = changedPaths.filter(file => !MOBILE_DISTRIBUTION_REPAIR_PATHS.has(file));
  requireFact(unsupported.length === 0, `product or original quality inputs changed: ${unsupported.join(', ')}`);
  const fingerprint = revision => createHash('sha256').update(git('ls-tree', '-r', revision).split('\n')
    .filter(line => !MOBILE_DISTRIBUTION_REPAIR_PATHS.has(line.slice(line.indexOf('\t') + 1))).join('\n')).digest('hex');
  const productDigest = fingerprint(qualitySourceSha);
  requireFact(productDigest === fingerprint(sourceSha), 'product input fingerprint differs');
  return { productDigest, changedPaths };
}

export function verifyMobileEvidenceIdentity(evidence, { sourceSha, runId }) {
  requireFact(evidence?.schemaVersion === 1 && evidence.kind === 'mobile-quality-reuse' &&
    evidence.sourceSha === sourceSha && evidence.distributionRunId === String(runId) &&
    sha.test(evidence.qualitySourceSha ?? '') && /^[1-9]\d*$/u.test(evidence.qualityRunId ?? '') &&
    /^[a-f0-9]{64}$/u.test(evidence.productDigest ?? ''), 'distribution evidence identity differs');
  return evidence;
}
