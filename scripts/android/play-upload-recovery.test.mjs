// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { preparePlaySubmission } from './play-preparation.mjs';
import { admitPlaySubmission } from './play-admission.mjs';
import { resolvePlayDeliveryRegistration } from './play-deliver-runner.mjs';
import { deliverRegisteredPlayCandidate } from './play-delivery.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';
import { registerMobileCandidate } from '../mobile/mobile-candidate-store.mjs';
import { createPlayRegistration } from '../mobile/mobile-candidate-provenance.mjs';

const opened = [];
afterEach(async () => { for (const f of opened.splice(0)) await f.close(); });
async function prepared() {
  const f = await submissionFixture(); opened.push(f); f.release('PUBLISHED');
  const args = { ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) };
  const result = await preparePlaySubmission(args);
  const bytes = f.saveSigned(42, result.versionCode);
  const admission = await admitPlaySubmission({ ...args, env: { ...f.env(), PLAY_PREBUILT: 'true' } });
  const registration = await resolvePlayDeliveryRegistration(f.clients().github,
    { ...f.env(), CANDIDATE_ARTIFACT: admission.artifactName }, args.registrarSha);
  const deliver = (loadBundle = async () => bytes) => deliverRegisteredPlayCandidate({ ...f.clients(), registration,
    loadBundle, notes: 'Original signed candidate' });
  const creates = () => f.calls.filter(call => call.method === 'POST' && call.route === 'edits').length;
  const status = description => ({ description, creator: { login: 'github-actions[bot]' } });
  return { f, registration, bytes, deliver, creates, status };
}

it('saves an opaque edit immediately and resumes the same encoded edit before loading the original bundle', async () => {
  const { f, registration, deliver, creates } = await prepared();
  const before = creates(); f.nextUploadEditId = 'opaque/id+=:value';
  await expect(deliver(async () => { throw new Error('bundle download interrupted'); })).rejects.toThrow('download interrupted');
  expect(f.histories.get(registration.id)[0].description).toBe('Play upload edit: open:opaque/id+=:value');
  expect(creates()).toBe(before + 1);
  const result = await deliver();
  expect(result).toMatchObject({ phase: 'observed', editId: f.nextUploadEditId });
  expect(creates()).toBe(before + 1); expect(f.uploads).toBe(1);
  expect(f.calls.some(call => call.route === 'edits/opaque%2Fid%2B%3D%3Avalue/bundles')).toBe(true);
});

it.each([204, 200])('recovers the same signed bytes after a creation response without a usable ID (HTTP %s)', async statusCode => {
  const { f, registration, deliver, creates, bytes } = await prepared();
  const before = creates(); f.createResponse = { status: statusCode, body: statusCode === 200 ? '{}' : '' };
  await expect(deliver()).rejects.toThrow(/HTTP 20[04]/u);
  expect(f.uploads).toBeUndefined();
  expect(f.histories.get(registration.id)[0].description).toBe('Play upload edit: creating');
  delete f.createResponse;
  const result = await deliver();
  expect(result.aabSha256).toBe(registration.payload.candidate.aabSha256);
  expect(result.versionCode).toBe(registration.payload.candidate.versionCode);
  expect(creates()).toBe(before + 2);
  expect(f.calls.find(call => call.route.includes('uploadType=media')).body).toEqual(bytes);
  expect(f.uploads).toBe(1); expect(f.commits).toBe(1);
});

it.each([
  { status: 200, body: '' },
  { status: 200, body: '{"releases":null}' }, { status: 200, body: '{"releases":[null]}' },
  { status: 200, body: '{"releases":[{}]}' }, { status: 200, body: '{"unexpected":true}' },
  { status: 200, body: 'secret-response' },
  { status: 403, body: 'secret-response' }
])('rejects an unavailable review read before creating or uploading ($status / $body)', async reply => {
  const { f, deliver, creates } = await prepared(); const before = creates(); f.releaseResponse = reply;
  let error; try { await deliver(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(Error); expect(error.message).not.toContain('secret-response');
  expect(error.message).toMatch(new RegExp(`HTTP ${reply.status}; content-type=.*; bytes=\\d+`, 'u'));
  expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
});

it('continues the original signed delivery on a successful 204 release inventory and retains review-safe commit', async () => {
  const { f, registration, deliver, bytes } = await prepared();
  f.releaseResponse = { status: 204, body: '', untilCommit: true };
  expect(await deliver()).toMatchObject({ phase: 'observed', versionCode: registration.payload.candidate.versionCode,
    aabSha256: registration.payload.candidate.aabSha256 });
  expect(f.calls.find(call => call.route.includes('uploadType=media')).body).toEqual(bytes);
  expect(f.calls.find(call => call.route.includes(':commit')).route).toContain('changesInReviewBehavior=ERROR_IF_IN_REVIEW');
  expect(f.uploads).toBe(1); expect(f.commits).toBe(1);
});

it('resumes an opaque saved edit after an uncertain upload without uploading its bundle again', async () => {
  const { f, deliver, creates } = await prepared(); const before = creates();
  f.nextUploadEditId = 'opaque/edit+resume'; f.loseUpload = true;
  await expect(deliver()).rejects.toThrow(/unknown/u);
  expect(await deliver(() => { throw new Error('must not reload'); })).toMatchObject({ phase: 'observed' });
  expect(creates()).toBe(before + 1); expect(f.uploads).toBe(1);
});

it('preserves the signed candidate while review is pending and continues it after review finishes', async () => {
  const { f, deliver, creates } = await prepared(); const before = creates(); f.release('IN_REVIEW');
  await expect(deliver()).rejects.toThrow(/Existing Play changes/u);
  expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
  f.release('PUBLISHED'); expect(await deliver()).toMatchObject({ phase: 'observed' });
  expect(f.uploads).toBe(1);
});

it('keeps the uploaded edit when Play rejects commit because another review started during upload', async () => {
  const { f, registration, deliver, creates } = await prepared();
  const before = creates();
  f.reviewAfterUpload = true;
  await expect(deliver()).rejects.toMatchObject({ status: 400, code: 'CHANGES_ALREADY_IN_REVIEW' });
  expect(f.histories.get(registration.id)[0].description).toBe('Play candidate: uploaded');
  expect(f.releases[0].releaseLifecycleState).toBe('RELEASE_LIFECYCLE_STATE_IN_REVIEW');
  expect(f.commits).toBeUndefined();
  f.reviewAfterUpload = false;
  f.release('PUBLISHED');
  expect(await deliver(() => { throw new Error('Must reuse the uploaded bundle'); })).toMatchObject({ phase: 'observed' });
  expect(creates()).toBe(before + 1);
  expect(f.uploads).toBe(1);
  expect(f.commits).toBe(1);
});

it.each(['upload-unknown', 'uploaded', 'commit-unknown', 'committed'])(
  'does not create or upload when a creating candidate has %s history', async phase => {
    const { f, registration, deliver, creates, status } = await prepared(); const before = creates();
    f.histories.set(registration.id, [status('Play upload edit: creating'), status(`Play candidate: ${phase}`)]);
    await expect(deliver()).rejects.toThrow();
    expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
  });

it.each(['missing', 'changed'])('does not recreate an edit when the original signed registration is %s', async change => {
  const { f, registration, deliver, creates, status } = await prepared(); const before = creates();
  f.histories.set(registration.id, [status('Play upload edit: creating')]);
  if (change === 'missing') f.rows = f.rows.filter(row => row.id !== registration.id);
  else f.rows.find(row => row.id === registration.id).payload.candidate.aabSha256 = 'b'.repeat(64);
  await expect(deliver()).rejects.toThrow();
  expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
});

it.each(['operation', 'snapshot', 'preparation'])('refuses signed creation recovery with another unresolved %s', async kind => {
  const { f, registration, deliver, creates, status } = await prepared(); const before = creates();
  f.histories.set(registration.id, [status('Play upload edit: creating')]);
  if (kind === 'preparation') {
    f.rows.push({ ...f.rows[0], id: 999, payload: { ...f.rows[0].payload, runId: '43', predecessor: f.rows[0].id } });
    f.histories.set(999, [status('Play preparation: {"phase":"creating"}')]);
  } else {
    f.rows.push({ ...registration, id: 999 });
    f.histories.set(999, [status(kind === 'operation' ? 'Play candidate: upload-unknown' : 'Play snapshot: creating')]);
  }
  await expect(deliver()).rejects.toThrow();
  expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
});

async function laterSigned(f, candidate) {
  const previous = f.uploadCandidate;
  const source = f.addSource(43); f.saveSigned(43, candidate.versionCode + 1);
  const row = await registerMobileCandidate(f.clients().github, createPlayRegistration({ ...source,
    candidate: source.candidate, registrarSha: 'e'.repeat(40) }));
  f.uploadCandidate = previous;
  return row;
}

it('uploads the admitted original when a later candidate is only signed and owns no edit or upload', async () => {
  const { f, registration, deliver, creates, status } = await prepared();
  const later = await laterSigned(f, registration.payload.candidate);
  f.histories.set(registration.id, [status('Play upload edit: creating')]);
  const before = creates();
  expect(await deliver()).toMatchObject({ phase: 'observed', versionCode: registration.payload.candidate.versionCode });
  expect(creates()).toBe(before + 1); expect(f.uploads).toBe(1);
  expect(f.histories.get(later.id)).toBeUndefined();
});

it.each(['Play upload edit: creating', 'Play upload edit: open:opaque/edit',
  'Play candidate: upload-unknown', 'Play candidate: uploaded', 'Play candidate: commit-unknown', 'Play candidate: committed'])(
  'keeps another signed candidate with %s from being invalidated by a new edit', async description => {
    const { f, registration, deliver, creates, status } = await prepared();
    const later = await laterSigned(f, registration.payload.candidate);
    f.histories.set(later.id, [status(description)]);
    const before = creates();
    await expect(deliver()).rejects.toThrow();
    expect(creates()).toBe(before); expect(f.uploads).toBeUndefined();
  });
