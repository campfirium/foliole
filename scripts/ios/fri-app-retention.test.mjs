// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  freshFriAcceptanceAppIds,
  FRI_PRODUCTION_APP_ID,
  retainFriDevelopmentApps,
  staleFriDevelopmentAppIds
} from './fri-app-retention.mjs';

function inventory(ids) {
  return { info: { outcome: 'success' }, result: {
    apps: ids.map((bundleIdentifier) => ({ bundleIdentifier }))
  } };
}

it('removes legacy Foliole development identities and retains fixed identities', () => {
  const value = inventory([
    FRI_PRODUCTION_APP_ID,
    'com.foliole.ios.devworkflow',
    'com.foliole.ios.physical-uitests.devworkflow.xctrunner',
    'com.foliole.ios.t152acceptance',
    'com.foliole.ios.physical-uitests.t152acceptance.xctrunner',
    'com.foliole.ios.t17325',
    'com.foliole.ios.physical-uitests.t17325.xctrunner',
    'com.foliole.ios.t152acceptance.adeadbeef',
    'com.example.unrelated'
  ]);

  expect(staleFriDevelopmentAppIds(value)).toEqual([
    'com.foliole.ios.physical-uitests.t17325.xctrunner',
    'com.foliole.ios.t152acceptance.adeadbeef',
    'com.foliole.ios.t17325'
  ]);
  expect(freshFriAcceptanceAppIds(value)).toEqual([
    'com.foliole.ios.t152acceptance',
    'com.foliole.ios.physical-uitests.t152acceptance.xctrunner'
  ]);
});

it('inventories Fri, removes only exact selected bundle identifiers, and writes a receipt', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-retention-'));
  const calls = [];
  const installed = new Set([
    FRI_PRODUCTION_APP_ID,
    'com.foliole.ios.devworkflow',
    'com.foliole.ios.t152acceptance',
    'com.foliole.ios.t173'
  ]);
  const run = async (command, args) => {
    calls.push([command, args]);
    const outputIndex = args.indexOf('--json-output');
    if (outputIndex >= 0) {
      fs.writeFileSync(args[outputIndex + 1], JSON.stringify(inventory([...installed])));
    } else if (args.includes('uninstall')) {
      installed.delete(args.at(-1));
    }
    return { code: 0 };
  };

  const receipt = await retainFriDevelopmentApps({ evidenceRoot, freshT152: true, run });

  expect(receipt.removed).toEqual([
    'com.foliole.ios.t152acceptance',
    'com.foliole.ios.t173'
  ]);
  expect(calls.filter(([, args]) => args.includes('uninstall'))
    .map(([, args]) => args.at(-1))).toEqual(receipt.removed);
  expect(calls.flat().join(' ')).not.toContain('com.example');
  expect(JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'receipt.json'), 'utf8')))
    .toEqual(receipt);
});

it('fails closed when devicectl inventory is not valid', () => {
  expect(() => staleFriDevelopmentAppIds({ info: { outcome: 'failure' } }))
    .toThrow('inventory is missing or invalid');
});
