// @vitest-environment node
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { preparePlaySubmission } from './play-preparation.mjs';
import { admitPlaySubmission } from './play-admission.mjs';
import { resumePendingPlaySubmission } from './play-submission-queue.mjs';
import { readPrebuiltPlayCandidate } from './play-prebuilt-candidate.mjs';
import { submissionFixture } from './play-submission-test-fixture.mjs';

const open = [];
afterEach(async () => { for (const f of open.splice(0)) await f.close(); });
async function fixture() { const f = await submissionFixture(); open.push(f); f.release('IN_REVIEW'); return f; }
const args = f => ({ ...f.clients(), env: f.env(), registrarSha: 'e'.repeat(40) });

it('starts the real workflow build during review instead of gating it on upload permission', async () => {
  const f = await fixture();
  const workflow = parse(readFileSync(process.env.PLAY_WORKFLOW_UNDER_TEST ?? '.github/workflows/release-android.yml', 'utf8'));
  const command = workflow.jobs.admission.steps.at(-1).run;
  const result = await (command === 'node scripts/android/play-preparation.mjs' ? preparePlaySubmission : admitPlaySubmission)(args(f));
  expect(result.proceed).toBe(true);
  expect(result.state).toBe('waiting');
  expect(f.calls.some(call => call.route.includes('uploadType') || call.route.includes(':commit'))).toBe(false);
});

it('prepares and retains the signed bundle during review, then resumes only upload admission once without rebuilding', async () => {
  const f = await fixture();
  const preparation = await preparePlaySubmission(args(f));
  const original = f.saveSigned(42, preparation.versionCode);
  const admission = () => admitPlaySubmission({ ...args(f), env: { ...f.env(), PLAY_PREBUILT: 'true' } });
  expect(await admission()).toMatchObject({ proceed: false, state: 'waiting' });
  const saved = await readPrebuiltPlayCandidate(f.clients().github, f.rows[0]);
  expect(saved.candidate).toMatchObject({ schemaVersion: 2, versionCode: preparation.versionCode });
  expect(saved.candidate.editId).toBeUndefined();
  expect(f.edits.size).toBe(0);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  expect(await resumePendingPlaySubmission(f.clients())).toBe('waiting');
  f.release('PUBLISHED');
  expect(await resumePendingPlaySubmission(f.clients())).toBe('resuming');
  expect(f.reruns).toEqual([4202]);
  expect(await admission()).toMatchObject({ proceed: true, state: 'admitted', artifactName: saved.signedArtifact.name });
  expect(f.sources.get('42').candidate.aabSha256).toBe(saved.candidate.aabSha256);
  expect(original.length).toBeGreaterThan(0);
  expect(f.calls.filter(call => call.method === 'POST' && call.route === 'edits')).toHaveLength(1);
});

it.each(['expired', 'corrupted', 'wrong-reservation'])('refuses a %s signed checkpoint before dispatching an upload job', async fault => {
  const f = await fixture(); const prepared = await preparePlaySubmission(args(f));
  f.saveSigned(42, fault === 'wrong-reservation' ? prepared.versionCode + 1 : prepared.versionCode);
  if (fault === 'expired') f.sources.get('42').signedArtifact.expired = true;
  if (fault === 'corrupted') f.sources.get('42').signedBytes = new Uint8Array([1, 2, 3]);
  Object.assign(f.sources.get('42').run, { status: 'completed', conclusion: 'success' });
  f.release('PUBLISHED');
  await expect(resumePendingPlaySubmission(f.clients())).rejects.toThrow();
  expect(f.reruns).toEqual([]);
});
