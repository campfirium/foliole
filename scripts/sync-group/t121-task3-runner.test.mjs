import { expect, it } from 'vitest';

import { authorizationDigest, createTask3Authorization } from './t121-task3-authorization.mjs';

const candidate = { branch: 'dev', clean: true, committed: true, revision: 'a'.repeat(40),
  treeDigest: 'tree', verifications: [{ status: 'passed' }] };

it('binds the exact reversible task 3 device mutations to one frozen candidate', () => {
  const request = createTask3Authorization(candidate);
  expect(request.boundary.mutations).toHaveLength(4);
  expect(request.boundary.mutations.join(' ')).toContain('product Topic');
  expect(authorizationDigest(request)).toBe(request.authorizationDigest);
});

it('does not authorize Leave, direct database writes, fallback, or background services', () => {
  const text = JSON.stringify(createTask3Authorization(candidate));
  expect(text).not.toMatch(/Leave|direct database|fallback|background service/u);
});
