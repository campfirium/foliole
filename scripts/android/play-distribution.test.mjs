/* global Buffer, structuredClone */
// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { allocatePlayVersion, preparePlayCandidate, uploadPlayCandidate, commitPlayCandidate, observePlayCandidate,
  verifyPlayCandidate } from './play-distribution.mjs';
import { createPlayApi, requireNoPendingReview } from './play-api.mjs';

const identity = { sourceSha: 'a'.repeat(40), acceptedSha: 'a'.repeat(40), runId: '42', version: '0.7.17' };
const bytes = Buffer.from('signed bundle fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const state = () => ({ schemaVersion: 1, ...identity, packageName: 'com.campfirium.foliole.android',
  track: 'beta', editId: '123', versionCode: 18, aabSha256: sha256, phase: 'signed' });
const published = { track: 'beta', releaseName: 'old', activeArtifacts: [{ versionCode: 17 }],
  releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED' };

function fixture() {
  let bundle;
  let release = published;
  const calls = [];
  const api = async (method, route, body) => {
    calls.push({ method, route, body });
    if (route === 'tracks/beta/releases') return { releases: [release] };
    if (route === 'edits') return { id: '123', expiryTimeSeconds: '9999999999' };
    if (route === 'edits/123/apks') return { apks: [] };
    if (route === 'edits/123/tracks') return { tracks: [{ track: 'beta', releases: [{ versionCodes: ['17'], status: 'completed' }] }] };
    if (route === 'edits/123/bundles' && method === 'GET') return { bundles: bundle ? [bundle] : [{ versionCode: 17 }] };
    if (route.includes('uploadType=media')) { bundle = { versionCode: 18, sha256 }; return bundle; }
    if (route === 'edits/123/tracks/beta') return { track: 'beta', releases: [] };
    if (route.includes(':commit')) release = { ...published, releaseName: '0.7.17.18.aaaaaaaaa',
      activeArtifacts: [{ versionCode: 18 }], releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' };
    return {};
  };
  return { api, calls, setBundle: value => { bundle = value; }, setRelease: value => { release = value; } };
}

it('allocates above actual bundle, APK, pending release and all track history rather than a fixed next code', () => {
  expect(allocatePlayVersion({ bundles: [{ versionCode: 4 }], apks: [{ versionCode: 99 }],
    tracks: [{ releases: [{ versionCodes: ['102'] }] }], releases: [published] })).toBe(103);
  for (const codes of [[], [{ versionCode: 'bad' }], [{ versionCode: 2100000000 }]]) {
    expect(() => allocatePlayVersion({ bundles: codes, apks: [], tracks: [], releases: [] })).toThrow();
  }
});

it('runs prepare, upload, commit and observed review continuously on the same candidate', async () => {
  const f = fixture(); const save = vi.fn();
  const candidate = await preparePlayCandidate(f.api, identity);
  expect(candidate.versionCode).toBe(18);
  Object.assign(candidate, { aabSha256: sha256, phase: 'signed' });
  await uploadPlayCandidate({ api: f.api, state: candidate, bytes, save });
  await commitPlayCandidate({ api: f.api, state: candidate, notes: 'Alpha update', save });
  await observePlayCandidate({ api: f.api, state: candidate, save });
  expect(candidate).toMatchObject({ phase: 'observed', releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' });
  const update = f.calls.find(call => call.method === 'PUT');
  expect(update.body).toEqual({ track: 'beta', releases: [{ name: '0.7.17.18.aaaaaaaaa', versionCodes: ['18'],
    status: 'completed', releaseNotes: [{ language: 'en-US', text: 'Alpha update' }] }] });
  expect(f.calls.find(call => call.route.includes(':commit')).route).toContain('changesInReviewBehavior=ERROR_IF_IN_REVIEW');
  expect(f.calls.filter(call => call.route.includes('uploadType'))).toHaveLength(1);
});

it('does not create edits or upload while code2 is under review', async () => {
  const f = fixture(); f.setRelease({ ...published, activeArtifacts: [{ versionCode: 2 }],
    releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' });
  await expect(preparePlayCandidate(f.api, identity)).rejects.toThrow(/pending review/u);
  expect(f.calls).toHaveLength(1);
  for (const lifecycle of ['DRAFT', 'NOT_SENT_FOR_REVIEW', 'APPROVED_NOT_PUBLISHED', 'UNSPECIFIED']) {
    expect(() => requireNoPendingReview([{ releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${lifecycle}` }])).toThrow();
  }
});

it('reconciles an unknown upload by exact hash and never retries an absent or different bundle', async () => {
  const f = fixture(); const candidate = state(); const save = vi.fn();
  f.setBundle({ versionCode: 18, sha256 });
  await uploadPlayCandidate({ api: f.api, state: candidate, bytes, restored: true, save });
  expect(candidate.phase).toBe('uploaded');
  expect(f.calls.some(call => call.method === 'POST')).toBe(false);
  f.setBundle(undefined);
  await expect(uploadPlayCandidate({ api: f.api, state: state(), bytes, restored: true, save })).rejects.toThrow(/uncertain/u);
  f.setBundle({ versionCode: 18, sha256: 'b'.repeat(64) });
  await expect(uploadPlayCandidate({ api: f.api, state: state(), bytes, restored: true, save })).rejects.toThrow(/differs/u);
  expect(f.calls.some(call => call.method === 'POST')).toBe(false);
});

it('records unknown operations before network failures and keeps the same edit recoverable', async () => {
  const f = fixture(); const candidate = state(); const snapshots = [];
  const save = value => snapshots.push(structuredClone(value));
  const api = async (...args) => { if (args[1].includes('uploadType')) throw new Error('lost response'); return f.api(...args); };
  await expect(uploadPlayCandidate({ api, state: candidate, bytes, save })).rejects.toThrow('lost response');
  expect(snapshots.at(-1)).toMatchObject({ editId: '123', phase: 'upload-unknown' });
  f.setBundle({ versionCode: 18, sha256 });
  await uploadPlayCandidate({ api: f.api, state: candidate, bytes, restored: true, save });
  const commitApi = async (...args) => {
    const result = await f.api(...args);
    if (args[1].includes(':commit')) throw new Error('lost commit response');
    return result;
  };
  await expect(commitPlayCandidate({ api: commitApi, state: candidate, notes: 'Update', save })).rejects.toThrow('lost commit response');
  expect(snapshots.at(-1).phase).toBe('commit-unknown');
  await observePlayCandidate({ api: f.api, state: candidate, save });
  expect(candidate.releaseLifecycleState).toBe('RELEASE_LIFECYCLE_STATE_IN_REVIEW');
});

it('reports rejection or manual submission as failure, separate from a completed track rollout', async () => {
  const f = fixture(); const candidate = { ...state(), releaseName: 'new', phase: 'committed' }; const save = vi.fn();
  for (const suffix of ['NOT_SENT_FOR_REVIEW', 'NOT_APPROVED', 'DRAFT']) {
    f.setRelease({ ...published, releaseName: 'new', activeArtifacts: [{ versionCode: 18 }],
      releaseLifecycleState: `RELEASE_LIFECYCLE_STATE_${suffix}` });
    await expect(observePlayCandidate({ api: f.api, state: candidate, save })).rejects.toThrow(/not confirmed/u);
    expect(candidate.releaseLifecycleState).toContain(suffix);
  }
  f.setRelease(published);
  await expect(observePlayCandidate({ api: f.api, state: candidate, save })).rejects.toThrow(/not observable/u);
});

it('rejects source, channel, run and protected version mismatches', () => {
  for (const change of [{ sourceSha: 'b'.repeat(40) }, { acceptedSha: 'b'.repeat(40) }, { runId: '43' },
    { track: 'production' }, { packageName: 'other' }, { versionCode: 2 }]) {
    expect(() => verifyPlayCandidate({ ...state(), ...change }, identity)).toThrow();
  }
});

it('uses authenticated fixed Play endpoints and sanitizes all error responses', async () => {
  const request = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: '123' }) }));
  const api = createPlayApi('secret-token', request);
  await api('POST', 'edits', {});
  expect(request.mock.calls[0][0]).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.campfirium.foliole.android/edits');
  expect(request.mock.calls[0][1].redirect).toBe('error');
  request.mockResolvedValue({ ok: false, status: 403, json: () => ({ secret: 'do not log' }) });
  await expect(api('POST', 'edits', {})).rejects.toThrow('HTTP 403');
  request.mockRejectedValue(new Error('secret-token'));
  await expect(api('POST', 'edits', {})).rejects.toThrow(/outcome is unknown/u);
});
