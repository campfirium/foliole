/* global Buffer */
// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { deliverRegisteredPlayCandidate } from './play-delivery.mjs';
import { createPlayRegistration, MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT } from '../mobile/mobile-candidate-provenance.mjs';
import { registrationFixture } from '../mobile/mobile-candidate-test-fixtures.mjs';

function fixture() {
  const f = registrationFixture(); const bytes = Buffer.from('original signed upload boundary');
  f.candidate.aabSha256 = createHash('sha256').update(bytes).digest('hex');
  const payload = createPlayRegistration(f);
  const registration = { id: 71, sha: payload.sourceSha, task: MOBILE_TASK, environment: PLAY_CANDIDATE_ENVIRONMENT,
    creator: { login: 'github-actions[bot]' }, payload };
  const history = []; const calls = []; let bundle; let release; let loseCommit = false; let loseUpload = false; let loseMarker = false;
  const github = async (method, route, body) => {
    if (method === 'GET') return [...history].reverse();
    history.push({ ...body, creator: { login: 'github-actions[bot]' } });
    if (loseMarker) { loseMarker = false; throw new Error('lost durable marker response'); }
    return { id: history.length };
  };
  const play = async (method, route, body) => {
    calls.push({ method, route, body, durablePhase: history.at(-1)?.description });
    if (route === 'tracks/beta/releases') return { releases: release ? [release] : [] };
    if (route === 'edits/123/bundles' && method === 'GET') return { bundles: bundle ? [bundle] : [] };
    if (route.includes('uploadType=media')) {
      expect(history.at(-1).description).toBe('Play candidate: upload-unknown');
      bundle = { versionCode: 4, sha256: f.candidate.aabSha256 };
      if (loseUpload) { loseUpload = false; throw new Error('lost upload response'); }
      return bundle;
    }
    if (method === 'GET' && route === 'edits/123/tracks/beta') return { track: 'beta', releases: [] };
    if (route.includes(':commit')) {
      expect(history.at(-1).description).toBe('Play candidate: commit-unknown');
      release = { track: 'beta', releaseName: '0.7.17.4.aaaaaaaaa', activeArtifacts: [{ versionCode: 4 }],
        releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' };
      if (loseCommit) { loseCommit = false; throw new Error('lost commit response'); }
    }
    return {};
  };
  return { github, play, registration, loadBundle: async () => bytes, notes: 'Candidate update', calls, history,
    loseCommit: () => { loseCommit = true; }, loseUpload: () => { loseUpload = true; }, loseMarker: () => { loseMarker = true; },
    setBundle: value => { bundle = value; } };
}

it('resumes a committed candidate after process restart and missing signed artifacts without re-upload or re-commit', async () => {
  const f = fixture(); f.loseCommit();
  await expect(deliverRegisteredPlayCandidate(f)).rejects.toThrow('lost commit response');
  expect(f.history.at(-1).description).toBe('Play candidate: commit-unknown');
  const receipt = await deliverRegisteredPlayCandidate({ ...f, loadBundle: () => { throw new Error('expired artifact must not be read'); } });
  expect(receipt).toMatchObject({ phase: 'observed', versionCode: 4, releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' });
  expect(f.calls.filter(call => call.route.includes('uploadType'))).toHaveLength(1);
  expect(f.calls.filter(call => call.route.includes(':commit'))).toHaveLength(1);
  expect(f.history.at(-1)).toMatchObject({ state: 'pending', auto_inactive: false });
});

it('reconciles a lost upload response by exact Play hash even after the original archive expires', async () => {
  const f = fixture(); f.loseUpload();
  await expect(deliverRegisteredPlayCandidate(f)).rejects.toThrow('lost upload response');
  await expect(deliverRegisteredPlayCandidate({ ...f, loadBundle: () => { throw new Error('expired'); } })).resolves.toMatchObject({ phase: 'observed' });
  expect(f.calls.filter(call => call.route.includes('uploadType'))).toHaveLength(1);
});

it('never repeats an upload after an uncertain durable write, an absent bundle or a hash conflict', async () => {
  const f = fixture(); f.loseMarker();
  await expect(deliverRegisteredPlayCandidate(f)).rejects.toThrow('lost durable marker response');
  await expect(deliverRegisteredPlayCandidate(f)).rejects.toThrow(/absent or uncertain/u);
  f.setBundle({ versionCode: 4, sha256: 'f'.repeat(64) });
  await expect(deliverRegisteredPlayCandidate(f)).rejects.toThrow(/SHA256 differs/u);
  expect(f.calls.some(call => call.route.includes('uploadType'))).toBe(false);
});
