// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { admitPlaySubmission } from './play-admission.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { readPlaySubmissionState } from './play-submission-store.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const fixtures = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });
async function waitingSubmission() {
  const f = await submissionFixture(); fixtures.push(f);
  f.release('IN_REVIEW');
  await admitPlaySubmission({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) });
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  return f;
}
const resume = f => resumePendingPlaySubmission(f.clients());
const rerunRequests = f => f.calls.filter(call => call.route === 'actions/jobs/4201/rerun');

it('reports rejection as an actionable failure across checks and preserves the blocked legacy source', async () => {
  const f = await waitingSubmission(); f.release('NOT_APPROVED');
  await expect(resume(f)).rejects.toThrow(/rejected|blocked/iu);
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('blocked');
  f.release('PUBLISHED');
  await expect(resume(f)).rejects.toThrow(/rejected|blocked/iu);
  expect(rerunRequests(f)).toHaveLength(0);
});

it.each(['cancelled', 'timed_out'])('reports a %s source instead of a successful scheduled check', async conclusion => {
  const f = await waitingSubmission(); f.sources.get('42').run.conclusion = conclusion;
  await expect(resume(f)).rejects.toThrow(/cancelled/iu);
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('cancelled');
  await expect(resume(f)).rejects.toThrow(/cancelled/iu);
  expect(rerunRequests(f)).toHaveLength(0);
});

it('keeps approval without publication actionable and resumes only after actual publication', async () => {
  const f = await waitingSubmission();
  expect(await resume(f)).toBe('waiting');
  f.release('APPROVED_NOT_PUBLISHED');
  await expect(resume(f)).rejects.toThrow(/publication/iu);
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('waiting');
  expect(rerunRequests(f)).toHaveLength(0);
  expect(f.calls.filter(call => call.route.includes('edits'))).toEqual([]);
  f.release('PUBLISHED');
  expect(await resume(f)).toBe('resuming');
  expect(await resume(f)).toBe('resuming');
  expect(rerunRequests(f)).toHaveLength(1);
});

it('reports a lost rerun response that never started without issuing another request', async () => {
  const f = await waitingSubmission(); f.release('PUBLISHED'); f.loseBeforeDispatch = true;
  await expect(resume(f)).rejects.toThrow(/unknown/iu);
  await expect(resume(f)).rejects.toThrow(/unknown/iu);
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('resuming:1');
  expect(rerunRequests(f)).toHaveLength(1);
  expect(f.reruns).toEqual([]);
});

it('recognizes a started rerun after response loss but reports missing admission after it completes', async () => {
  const f = await waitingSubmission(); f.release('PUBLISHED'); f.lostDispatch = true;
  await expect(resume(f)).rejects.toThrow(/unknown/iu);
  expect(await resume(f)).toBe('resuming');
  f.sources.get('42').run.status = 'completed';
  await expect(resume(f)).rejects.toThrow(/reconcil/iu);
  expect(await readPlaySubmissionState(f.clients().github, f.rows[0])).toBe('resuming:1');
  expect(rerunRequests(f)).toHaveLength(1);
});
