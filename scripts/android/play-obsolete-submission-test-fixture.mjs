import { admitPlaySubmission } from './play-admission.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

export const submissionArgs = (f, id = 43) => ({ ...f.clients(), env: f.env(id), registrarSha: 'e'.repeat(40) });
export const writes = f => f.calls.filter(call => call.method !== 'GET');
export async function obsoleteSubmissionFixture() {
  const f = await submissionFixture();
  f.release('IN_REVIEW');
  await admitPlaySubmission(submissionArgs(f, 42));
  const source = f.sources.get('42');
  Object.assign(source.run, { status: 'completed', conclusion: 'success' });
  source.jobs.push(...['Build and sign the original Android candidate', 'Deliver the durable Android candidate']
    .map(name => ({ name: `mobile-android / ${name}`, status: 'completed', conclusion: 'skipped' })));
  f.releases = [];
  f.addSource(43);
  return f;
}
