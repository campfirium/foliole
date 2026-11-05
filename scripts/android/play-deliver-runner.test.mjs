// @vitest-environment node
import { expect, it } from 'vitest';
import { resolvePlayDeliveryRegistration } from './play-deliver-runner.mjs';
import { readReservedPlayHistory } from './play-candidate-history.mjs';
import { createPlayRegistration, MOBILE_TASK, PLAY_CANDIDATE_ENVIRONMENT } from '../mobile/mobile-candidate-provenance.mjs';
import { registrationFixture } from '../mobile/mobile-candidate-test-fixtures.mjs';

function fixture(lane = 'dev-remote') {
  const f = registrationFixture(lane); const payload = createPlayRegistration(f);
  const rows = [{ id: 7, sha: payload.sourceSha, task: MOBILE_TASK, environment: PLAY_CANDIDATE_ENVIRONMENT,
    creator: { login: 'github-actions[bot]' }, payload }];
  const env = { GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: f.run.head_sha,
    GITHUB_REF: `refs/heads/${f.run.head_branch}`, TRIGGER_REF: `refs/heads/${f.run.head_branch}`,
    TARGET_SHA: f.run.head_sha, TARGET_VERSION: f.candidate.version,
    EXECUTION_LANE: lane === 'release-t7' ? 'release-t7' : 'qa-mobile-beta' };
  const api = async (method, route) => {
    if (route === 'actions/runs/42') return f.run;
    if (route.startsWith('deployments?')) return rows;
    if (route.endsWith('/statuses?per_page=100')) return [{ creator: { login: 'github-actions[bot]' }, description: 'Play candidate: observed' }];
    throw new Error('Unexpected external operation');
  };
  return { ...f, rows, env, api };
}

it.each(['dev-remote', 'release-t7'])('recovers the original %s durable candidate without rereading expired archives', async lane => {
  const f = fixture(lane);
  expect(await resolvePlayDeliveryRegistration(f.api, f.env)).toEqual(f.rows[0]);
  for (const patch of [{ TARGET_SHA: 'f'.repeat(40) }, { GITHUB_SHA: 'f'.repeat(40) },
    { GITHUB_REF: 'refs/heads/dev' }, { GITHUB_RUN_ATTEMPT: '1' }, { TARGET_VERSION: '0.0.0' }]) {
    await expect(resolvePlayDeliveryRegistration(f.api, { ...f.env, ...patch })).rejects.toThrow();
  }
  f.run.head_repository.full_name = 'external/repo';
  await expect(resolvePlayDeliveryRegistration(f.api, f.env)).rejects.toThrow(/Actual delivery run/u);
});

it('keeps every durable reservation above discarded Play inventory and the versioned history floor', async () => {
  const f = fixture();
  expect((await readReservedPlayHistory(f.api, { highestVersionCode: 3 })).highestVersionCode).toBe(4);
  expect((await readReservedPlayHistory(f.api, { highestVersionCode: 9 })).highestVersionCode).toBe(9);
  f.rows[0].payload.candidate.aabSha256 = 'invalid';
  await expect(readReservedPlayHistory(f.api, { highestVersionCode: 3 })).rejects.toThrow();
});

it('blocks a new edit while a previously registered upload remains uncertain', async () => {
  const f = fixture();
  const api = async (...args) => args[1].endsWith('/statuses?per_page=100') ? [] : f.api(...args);
  await expect(readReservedPlayHistory(api, { highestVersionCode: 3 })).rejects.toThrow(/earlier Play operation remains unresolved/u);
});
