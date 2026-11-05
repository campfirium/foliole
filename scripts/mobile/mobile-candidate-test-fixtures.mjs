import { createChainVerdict, fullChainStages } from '../quality/chain-verdict.mjs';

export function registrationFixture(lane = 'dev-remote') {
  const sha = 'a'.repeat(40);
  const release = lane === 'release-t7';
  const run = { id: 42, run_attempt: 2, head_sha: sha, status: 'in_progress',
    head_branch: release ? 'release' : 'check', event: release ? 'push' : 'workflow_dispatch',
    path: release ? '.github/workflows/t7-release.yml' : '.github/workflows/remote-quality.yml',
    head_repository: { full_name: 'campfirium/foliole' },
    display_title: `Dev Quality Check (full) @ ${sha.slice(0, 9)} [mobile:android]` };
  const artifact = (id, name) => ({ id, name, expired: false, digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 42, head_sha: sha } });
  const quality = createChainVerdict({ selection: 'all', targetSha: sha, runId: '42', runAttempt: 1, lane,
    needs: Object.fromEntries(fullChainStages(lane).map(stage => [stage, { result: 'success', outputs: { accepted_sha: sha } }])) });
  const candidate = { schemaVersion: 1, sourceSha: sha, acceptedSha: sha, runId: '42', version: '0.7.17',
    packageName: 'com.campfirium.foliole.android', track: 'beta', editId: '123', versionCode: 4,
    aabSha256: 'c'.repeat(64), phase: 'signed', dexSha256: { 'classes.dex': 'd'.repeat(64) },
    certificateSha256: '3A:63:39:38:11:29:26:8C:65:1A:97:3F:A4:FF:A2:4F:F2:E3:E6:B3:32:F2:28:E4:E1:E0:AB:02:AF:BE:18:0B' };
  return { run, quality, candidate, registrarSha: 'e'.repeat(40), signedArtifact: artifact(10, 'android-play-42-1-signed'),
    qualityArtifact: artifact(11, 'chain-verdict-42-1'), jobs: [{
      name: release ? 'Full chain / quality-admission / verdict' : 'full-quality / quality-admission / verdict', conclusion: 'success' },
    ...(release ? [{ name: 'Release candidate quality / Release candidate quality', conclusion: 'success' }] : [])] };
}
