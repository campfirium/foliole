import { expect, it } from 'vitest';

import { sqlFingerprint } from './sqlFingerprint.js';

it.each([
  "SELECT 'private--text', 'private/*text*/', 'private''quote', X'c0ffee', 123, 0xBAD /* private */",
  'SELECT "private--identifier", [private], `private`, 1e10 -- private',
  "SELECT 'private-unclosed",
  'SELECT 1 /* private-unclosed'
])('redacts literal contents even when they contain comment delimiters', sql => {
  expect(sqlFingerprint(sql)).not.toMatch(/private|c0ffee|BAD|123|1e10/u);
  expect(sqlFingerprint(sql)).toContain('SELECT');
});
