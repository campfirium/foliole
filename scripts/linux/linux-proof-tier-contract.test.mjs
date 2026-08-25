// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

import {
  LINUX_DEB_PROOF_CONTRACT,
  assertLinuxDebProofContract
} from './linux-proof-tier-contract.mjs';
import {
  collectElectronTestFiles
} from '../run-desktop-electron-test-bucket.mjs';
import {
  collectScriptTestFiles,
  isLinuxOnlyScriptTest,
  selectScriptTestBucketFiles
} from '../script-test-bucket-selection.mjs';

it('routes every Linux DEB proof to one earliest reliable owner', () => {
  expect(assertLinuxDebProofContract()).toBe(LINUX_DEB_PROOF_CONTRACT);
  for (const { owner } of LINUX_DEB_PROOF_CONTRACT) expect(fs.existsSync(owner), owner).toBe(true);
  expect(new Set(LINUX_DEB_PROOF_CONTRACT.map(({ id }) => id)).size)
    .toBe(LINUX_DEB_PROOF_CONTRACT.length);
  expect(LINUX_DEB_PROOF_CONTRACT.filter(({ tier }) => tier === 'repository')).toHaveLength(2);
  expect(LINUX_DEB_PROOF_CONTRACT.filter(({ tier }) => tier === 'hosted-contract')).toHaveLength(2);
  expect(LINUX_DEB_PROOF_CONTRACT.filter(({ tier }) => tier === 'package-install')).toHaveLength(3);
});

it('puts repository and host contracts in T5 before the installed DEB journey', () => {
  const scriptFiles = collectScriptTestFiles();
  const proofTest = 'scripts/linux/linux-proof-tier-contract.test.mjs';
  expect(selectScriptTestBucketFiles('all', scriptFiles)).toContain(proofTest);
  const windows = ['core-one', 'core-two', 'gate-one', 'gate-two',
    'gate-integration', 'node', 'preview'].flatMap(
    (bucket) => selectScriptTestBucketFiles(bucket, scriptFiles, 'win32')
  );
  expect(isLinuxOnlyScriptTest(proofTest)).toBe(true);
  expect(windows).not.toContain(proofTest);
  const electronFiles = collectElectronTestFiles();
  for (const owner of LINUX_DEB_PROOF_CONTRACT
    .filter(({ tier }) => tier === 'hosted-contract').map(({ owner }) => owner)) {
    expect(electronFiles).toContain(owner);
  }
});

it('keeps installed and package-only facts in the unique release-linux owner', () => {
  const workflows = fs.readdirSync('.github/workflows').filter((file) => file.endsWith('.yml'))
    .map((file) => fs.readFileSync(`.github/workflows/${file}`, 'utf8'));
  expect(workflows.filter((source) => source.includes(
    'node scripts/linux/accept-linux-deb.mjs'
  ))).toHaveLength(1);
  const releaseLinux = fs.readFileSync('.github/workflows/release-linux.yml', 'utf8');
  expect(releaseLinux).toContain('node scripts/linux/package-linux-deb.mjs');
  expect(releaseLinux).toContain('node scripts/linux/accept-linux-deb.mjs');
  const acceptance = fs.readFileSync('scripts/linux/accept-linux-deb.mjs', 'utf8');
  expect(acceptance).toContain("run('sudo', ['apt-get', 'install', '-y', debPath])");
  expect(acceptance).toContain("run('sudo', ['apt-get', 'remove', '-y', 'foliole'])");
});

it('fails closed on duplicate ids, unknown tiers, or an early runtime owner', () => {
  expect(() => assertLinuxDebProofContract([
    { id: 'same', tier: 'repository', owner: 'a.test.mjs' },
    { id: 'same', tier: 'repository', owner: 'b.test.mjs' }
  ])).toThrow('Duplicate');
  expect(() => assertLinuxDebProofContract([
    { id: 'unknown', tier: 'published', owner: 'a.test.mjs' }
  ])).toThrow('Unknown Linux proof tier');
  expect(() => assertLinuxDebProofContract([
    { id: 'early-runtime', tier: 'repository', owner: 'scripts/linux/accept-linux-deb.mjs' }
  ])).toThrow('deterministic test');
});
