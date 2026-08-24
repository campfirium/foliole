// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

import { scenarioCatalog } from './multi-device-sync-scenario-catalog.mjs';
import {
  assertProofResponsibility, DATA_SCENARIO_PROOFS, PROOF_OWNERS
} from './sync-proof-responsibility.mjs';

it('assigns three proof axes to distinct owners and every entry to one cutover', () => {
  expect(assertProofResponsibility({ legacyEntries: scenarioCatalog().map(({ name }) => name) }))
    .toEqual({ dataEntries: 6, legacyEntries: 6 });
  expect(new Set(Object.values(PROOF_OWNERS))).toHaveLength(3);
  expect(DATA_SCENARIO_PROOFS.map(({ cutoverOwner }) => cutoverOwner))
    .toEqual(['T146-16', 'T146-17', 'T146-18', 'T146-19', 'T146-20', 'T146-21']);
  expect(() => assertProofResponsibility({ legacyEntries: scenarioCatalog().map(({ name }) => name),
    owners: { ...PROOF_OWNERS, readiness: PROOF_OWNERS.data } })).toThrow('distinct owner');
  expect(() => assertProofResponsibility({ dataEntries: [DATA_SCENARIO_PROOFS[0],
    DATA_SCENARIO_PROOFS[0]], legacyEntries: scenarioCatalog().map(({ name }) => name) }))
    .toThrow('duplicated');
  expect(() => assertProofResponsibility({ legacyEntries: ['nonempty-library-convergence'] }))
    .toThrow('coverage is incomplete');
});

it('records only actual Mac+A5 or Mac+A5+Windows host columns', () => {
  expect(DATA_SCENARIO_PROOFS[0].hosts).toEqual(['mac', 'android-a5']);
  expect(DATA_SCENARIO_PROOFS.slice(1).every(({ hosts }) =>
    JSON.stringify(hosts) === JSON.stringify(['mac', 'android-a5', 'windows']))).toBe(true);
});

it('keeps readiness and receipts out of data success and controller consumption', () => {
  const data = fs.readFileSync('scripts/sync-group/sync-data-proof-contract.mjs', 'utf8');
  expect(data).not.toMatch(/provider|listener|credential|group|readiness|folioleActionReceipt/iu);
  const controllerSources = fs.readdirSync('scripts/sync-group')
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .map((name) => fs.readFileSync(`scripts/sync-group/${name}`, 'utf8')).join('\n');
  expect(controllerSources).not.toMatch(/android-public-runtime-readiness-contract|android-instrumentation-receipt-contract/u);
});
