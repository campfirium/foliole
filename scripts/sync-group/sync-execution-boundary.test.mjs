// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

it('keeps Mac sync execution independent from Windows business modules', () => {
  const macSources = [
    'scripts/android/macos-a5-pair-sync-action.mjs',
    'scripts/sync-group/multi-device-sync-macos-channel.mjs',
    'scripts/sync-group/pair-sync-feature-journey.mjs'
  ].map(read).join('\n');
  expect(macSources).not.toMatch(/from ['"][^'"]*windows[^'"]*pair-sync/iu);
});

it('keeps host mechanics free of product ownership and business receipt interpretation', () => {
  const adapters = [
    'scripts/android/macos-a5-sync-group-maintenance-action.mjs',
    'scripts/sync-group/multi-device-sync-windows-provider.mjs',
    'scripts/sync-group/multi-device-sync-stage-runtime.mjs'
  ].map(read).join('\n');
  expect(adapters).not.toContain('failureOwner');
  expect(read('scripts/android/macos-a5-sync-group-maintenance-action.mjs'))
    .not.toMatch(/Inbox|credential|attention|folioleActionReceipt/iu);
});

it('routes an injected host failure only after it reaches the scenario boundary', () => {
  const boundary = read('scripts/sync-group/multi-device-sync-diagnostic.mjs');
  expect(boundary).toContain("error.failureAxis === 'proof' ? 'product'");
  expect(boundary).toContain("error.executionOwner === 'environment' ? 'environment' : 'controller'");
});
