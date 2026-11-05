import { fullChainStages, stagesVerdict } from '../quality/chain-verdict.mjs';
import { verifyPlayCandidate } from '../android/play-distribution.mjs';
import { parseRemoteQualityRun } from '../quality/remote-quality-run-title.mjs';

export const MOBILE_REPOSITORY = 'campfirium/foliole';
export const MOBILE_TASK = 'foliole-mobile-candidate';
export const PLAY_CANDIDATE_ENVIRONMENT = 'foliole-play-beta';
const fail = message => { throw new Error(`Mobile candidate registration refused: ${message}`); };
const UPLOAD_CERTIFICATE = '3A:63:39:38:11:29:26:8C:65:1A:97:3F:A4:FF:A2:4F:F2:E3:E6:B3:32:F2:28:E4:E1:E0:AB:02:AF:BE:18:0B';

function verifyOrigin(run, candidate) {
  if (run?.head_repository?.full_name !== MOBILE_REPOSITORY ||
      String(run.id) !== candidate?.runId || !Number.isSafeInteger(run.run_attempt) ||
      !['in_progress', 'completed'].includes(run.status) ||
      !/^\d+\.\d+\.\d+$/u.test(candidate.version ?? '')) fail('run or version identity differs');
  const release = run.head_branch === 'release' && run.path === '.github/workflows/t7-release.yml' &&
    ['push', 'workflow_dispatch'].includes(run.event);
  const remote = parseRemoteQualityRun(run);
  const qa = run.head_branch === 'check' && run.path === '.github/workflows/remote-quality.yml' &&
    run.event === 'workflow_dispatch' && remote?.scope === 'full' &&
    remote.mobileDistribution === 'android' && remote.testedSha === run.head_sha;
  if (!release && !qa) fail('not an authorized release or explicit Android full QA');
  verifyPlayCandidate(candidate, { sourceSha: run.head_sha, runId: String(run.id), version: candidate.version });
  if (candidate.phase !== 'signed' || !/^[a-f\d]{64}$/u.test(candidate.aabSha256 ?? '') ||
      candidate.certificateSha256 !== UPLOAD_CERTIFICATE) {
    fail('a signed original upload candidate is required');
  }
  return release ? 'release-t7' : 'dev-remote';
}

function artifactFact(artifact, name, run) {
  if (!artifact || artifact.expired || artifact.name !== name ||
      String(artifact.workflow_run?.id) !== String(run.id) ||
      artifact.workflow_run.head_sha !== run.head_sha || !Number.isSafeInteger(artifact.id) ||
      !/^sha256:[a-f\d]{64}$/u.test(artifact.digest ?? '')) fail('artifact provenance differs');
  return { id: artifact.id, name: artifact.name, digest: artifact.digest };
}

export function createPlayRegistration({ run, signedArtifact, qualityArtifact, quality, jobs, candidate }) {
  const lane = verifyOrigin(run, candidate);
  const signedAttempt = Number(signedArtifact?.name?.match(/^android-play-\d+-([1-9]\d*)-signed$/u)?.[1]);
  if (!signedAttempt || signedAttempt > run.run_attempt) fail('signed attempt is invalid');
  const signed = artifactFact(signedArtifact, `android-play-${run.id}-${signedAttempt}-signed`, run);
  if (!Number.isSafeInteger(quality?.run_attempt) || quality.run_attempt > signedAttempt ||
      String(quality.run_id) !== String(run.id) || quality.kind !== 'full' || quality.lane !== lane ||
      quality.target_sha !== run.head_sha || quality.accepted_sha !== run.head_sha || quality.verdict !== 'passed') {
    fail('full quality identity differs');
  }
  const accepted = artifactFact(qualityArtifact, `chain-verdict-${run.id}-${quality.run_attempt}`, run);
  const stages = fullChainStages(lane);
  const needs = Object.fromEntries(stages.map(stage => [stage, {
    result: quality.stages?.[stage], outputs: { accepted_sha: quality.stage_shas?.[stage] }
  }]));
  if (stagesVerdict(stages, needs, run.head_sha) !== 'passed') fail('full quality did not accept the source');
  const admission = lane === 'release-t7' ? 'Full chain / quality-admission / verdict' : 'full-quality / quality-admission / verdict';
  if (!jobs.some(job => job.name === admission && job.conclusion === 'success')) fail('quality admission did not succeed');
  if (lane === 'release-t7' && !jobs.some(job =>
    job.name === 'Release candidate quality / Release candidate quality' && job.conclusion === 'success')) {
    fail('release candidate acceptance did not succeed');
  }
  const original = Object.fromEntries(['schemaVersion', 'sourceSha', 'acceptedSha', 'version', 'runId',
    'packageName', 'track', 'editId', 'expiryTimeSeconds', 'versionCode', 'historyVersionCode',
    'aabSha256', 'certificateSha256', 'phase'].filter(key => candidate[key] !== undefined).map(key => [key, candidate[key]]));
  return { schemaVersion: 1, kind: MOBILE_TASK, platform: 'android', repository: MOBILE_REPOSITORY,
    lane, sourceSha: run.head_sha, runId: String(run.id), signedAttempt,
    workflow: run.path, signedArtifact: signed, qualityArtifact: accepted, qualityAttempt: quality.run_attempt,
    candidate: original };
}

export function verifyMobileRegistrationPayload(payload) {
  if (payload?.schemaVersion !== 1 || payload.kind !== MOBILE_TASK || payload.platform !== 'android' ||
      payload.repository !== MOBILE_REPOSITORY || !['dev-remote', 'release-t7'].includes(payload.lane) ||
      !/^[1-9]\d*$/u.test(payload.runId ?? '') || !Number.isSafeInteger(payload.signedAttempt) ||
      !Number.isSafeInteger(payload.qualityAttempt) || payload.qualityAttempt < 1 ||
      payload.signedAttempt < payload.qualityAttempt) fail('persisted origin is invalid');
  verifyPlayCandidate(payload.candidate, { sourceSha: payload.sourceSha, runId: payload.runId,
    version: payload.candidate?.version });
  if (payload.candidate.phase !== 'signed' || !/^\d+\.\d+\.\d+$/u.test(payload.candidate.version ?? '') ||
      payload.candidate.certificateSha256 !== UPLOAD_CERTIFICATE ||
      !/^[a-f\d]{64}$/u.test(payload.candidate.aabSha256 ?? '')) fail('persisted signed candidate is invalid');
  const workflow = payload.lane === 'release-t7' ? '.github/workflows/t7-release.yml' : '.github/workflows/remote-quality.yml';
  if (payload.workflow !== workflow) fail('persisted workflow differs');
  for (const [artifact, name] of [[payload.signedArtifact, `android-play-${payload.runId}-${payload.signedAttempt}-signed`],
    [payload.qualityArtifact, `chain-verdict-${payload.runId}-${payload.qualityAttempt}`]]) {
    if (!Number.isSafeInteger(artifact?.id) || artifact.name !== name ||
        !/^sha256:[a-f\d]{64}$/u.test(artifact.digest ?? '')) fail('persisted artifact identity differs');
  }
  return payload;
}
