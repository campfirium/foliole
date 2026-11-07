import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPOSITORY = 'campfirium/foliole';

export async function readReleaseCiReceipt({ artifactId, platform, identity, cwd, run }) {
  if (!/^[1-9]\d*$/u.test(String(artifactId ?? '')) || platform !== 'ios') {
    throw new Error('An exact iPhone CI receipt artifact ID is required');
  }
  const api = endpoint => JSON.parse(run('gh', ['api', `repos/${REPOSITORY}/${endpoint}`], { cwd, encoding: 'utf8' }));
  const artifact = api(`actions/artifacts/${artifactId}`);
  const source = identity.sourceSha;
  const evidenceRun = artifact.workflow_run;
  const build = api(`actions/runs/${evidenceRun?.id}`);
  if (artifact.id !== Number(artifactId) || artifact.expired !== false ||
      !new RegExp(`^release-ios-${source}-[1-9]\\d*$`, 'u').test(artifact.name ?? '') ||
      evidenceRun?.head_sha !== source || evidenceRun?.head_branch !== 'release' ||
      build.id !== evidenceRun.id || build.head_sha !== source || build.head_branch !== 'release' ||
      build.path !== '.github/workflows/t7-release.yml' || build.repository?.full_name !== REPOSITORY ||
      build.status !== 'completed' || build.conclusion !== 'success' ||
      !/^sha256:[a-f\d]{64}$/u.test(artifact.digest ?? '')) {
    throw new Error('iPhone receipt artifact must belong to the successful exact-source T7 run');
  }
  const bytes = run('gh', ['api', `repos/${REPOSITORY}/actions/artifacts/${artifactId}/zip`], { cwd, encoding: null });
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.digest) {
    throw new Error('iPhone CI receipt artifact digest differs');
  }
  await mkdir(path.join(cwd, '.tmp/artifacts'), { recursive: true });
  const directory = await mkdtemp(path.join(cwd, '.tmp/artifacts/release-ci-receipt-'));
  const archive = path.join(directory, 'receipt.zip');
  await writeFile(archive, bytes);
  const name = `Foliole-iOS-${identity.intent.version}-TestFlight.json`;
  const receipt = JSON.parse(run('unzip', ['-p', archive, name], { cwd, encoding: 'utf8' }));
  if (receipt.runId !== String(build.id)) throw new Error('iPhone receipt run differs from its CI artifact');
  return receipt;
}
