// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  friAcceptanceBundle, persistFriProjection, resolveFriEvidenceRoot
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

it('copies a promoted projection into its run-specific evidence root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-projection-'));
  const source = path.join(root, 'promoted.json');
  const evidenceRoot = path.join(root, 'run');
  fs.writeFileSync(source, '{"events":[]}\n');

  const persisted = persistFriProjection({ file: source, value: { events: [] } }, evidenceRoot);

  expect(persisted.file).toBe(path.join(evidenceRoot, 'projection.json'));
  expect(fs.readFileSync(persisted.file, 'utf8')).toBe('{"events":[]}\n');
  fs.rmSync(root, { force: true, recursive: true });
});
