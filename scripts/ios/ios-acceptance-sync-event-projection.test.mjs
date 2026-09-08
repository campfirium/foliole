// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  friAcceptanceBundle, resolveFriEvidenceRoot
} from './ios-acceptance-sync-event-projection.mjs';

it('runs the isolated signed projection target and accepts only its fixed fields', () => {
  const source = fs.readFileSync('scripts/ios/ios-acceptance-sync-event-projection.mjs', 'utf8');
  const projectionTest = fs.readFileSync(
    'ios/App/AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests.swift',
    'utf8'
  );
  expect(source).toContain('AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests');
  expect(source).toContain('FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix');
  expect(source).toContain('value.container_identity !== applicationId');
  expect(source).not.toMatch(/CapacitorDatabase|device copy|container_path|workgroup_key|endpoint/u);
  expect(projectionTest).toContain('requiredEnvironment("FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX")');
  expect(projectionTest).not.toContain('.t152-acceptance');
});

it('uses one fixed signed acceptance container for the task', () => {
  expect(friAcceptanceBundle('t173')).toEqual({
    applicationId: 'com.foliole.ios.t173',
    suffix: '.t173'
  });
  expect(() => friAcceptanceBundle('12345678-1234-4234-8234-123456789abc'))
    .toThrow('task identity');
});

it('loads promoted Fri evidence from the runner receipt', () => {
  const result = { lines: ['build output', JSON.stringify({
    classification: 'accepted', promoted: '/evidence/accepted'
  })] };
  expect(resolveFriEvidenceRoot(result, '/requested')).toBe('/evidence/accepted');
  expect(resolveFriEvidenceRoot({ lines: ['build output'] }, '/requested')).toBe('/requested');
});
