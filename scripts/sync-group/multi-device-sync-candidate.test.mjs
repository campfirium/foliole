import { expect, it } from 'vitest';

/* global process */

import { currentAcceptanceCandidate } from './multi-device-sync-candidate.mjs';

it('binds the whole committed source tree without manual controller or predicate digests', () => {
  const candidate = currentAcceptanceCandidate(process.cwd());
  expect(candidate.revision).toMatch(/^[0-9a-f]{40}$/u);
  expect(candidate.treeDigest).toMatch(/^[0-9a-f]{40}$/u);
  expect(candidate).not.toHaveProperty('controllerDigest');
  expect(candidate).not.toHaveProperty('scenarioDigest');
  expect(candidate).not.toHaveProperty('criteriaDigest');
});
