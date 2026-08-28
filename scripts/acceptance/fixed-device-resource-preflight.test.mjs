// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

import { fixedDevicePreflightPaths } from './fixed-device-resource-preflight.mjs';

it('allocates one revision-bound evidence root per fixed-device dry preflight', () => {
  const first = fixedDevicePreflightPaths('/repo', 'a'.repeat(40),
    '20260828T010203456-12345678');
  const second = fixedDevicePreflightPaths('/repo', 'a'.repeat(40),
    '20260828T010203457-87654321');
  expect(first.root).not.toBe(second.root);
  expect(first.receiptPath).toContain('fixed-devices');
});

it('keeps the dry preflight behind fixed locks and free of product mutation', () => {
  const source = fs.readFileSync('scripts/acceptance/fixed-device-resource-preflight.mjs', 'utf8');
  expect(source).toContain("acquireMacosA5DeviceLease(context, 'readonly-lifecycle', { fsApi })");
  expect(source).toContain("className: 'exclusive'");
  expect(source).not.toMatch(/install|launch|sync group|pair|database/iu);
});
