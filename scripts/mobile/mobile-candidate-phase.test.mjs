// @vitest-environment node
import { expect, it } from 'vitest';
import { readMobileCandidatePhase } from './mobile-candidate-phase.mjs';

it('retains the confirmed upload outcome after more than 100 later review checks', async () => {
  const calls = [];
  const api = async (method, route) => {
    calls.push({ method, route });
    return route.endsWith('page=2') ? [{ description: 'Play candidate: observed', creator: { login: 'github-actions[bot]' } }] :
      Array.from({ length: 100 }, () => ({ description: 'Play availability: waiting', creator: { login: 'github-actions[bot]' } }));
  };
  await expect(readMobileCandidatePhase(api, 71)).resolves.toBe('observed');
  expect(calls).toHaveLength(2);
});
