// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { parseQualityGateRoutePlan } from './quality-gate-route-json.mjs';

describe('quality gate route JSON formatter', () => {
  it('converts the human route plan into stable JSON fields', () => {
    const route = parseQualityGateRoutePlan([
      '[quality-gate-route] selected level: desktop',
      '[quality-gate-route] reason: desktop runtime changed',
      '[quality-gate-route] target: quality:desktop',
      '[quality-gate-route] changed files:',
      '[quality-gate-route]   electron/main.ts',
      '[quality-gate-route] lint targets:',
      '[quality-gate-route]   electron/main.ts',
      '[quality-gate-route] related tests:',
      '[quality-gate-route]   electron/main.test.ts'
    ].join('\n'));

    expect(route).toEqual({
      changedFiles: ['electron/main.ts'],
      level: 'desktop',
      lintTargets: ['electron/main.ts'],
      reason: 'desktop runtime changed',
      relatedTests: ['electron/main.test.ts'],
      target: 'quality:desktop'
    });
  });
});
