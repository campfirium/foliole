/* global console */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { SWIFT_LOCKS } from './swift-security-evidence.mjs';
import { scanSwiftLocks } from './swift-vulnerability-scan.mjs';
import { ensureIosTrivy } from './ios-security-trivy.mjs';
import { readOfficialSource, releaseMetadata, assessSqlcipherRelease } from './ios-security-sources.mjs';

export async function runIosSecurityControls({ root, output, token, trivy }) {
  mkdirSync(output, { recursive: true });
  const binary = trivy ?? await ensureIosTrivy({ root });
  const results = {};
  for (const [name, version] of [['vulnerable', '8.5.0'], ['fixed', '8.5.1']]) {
    const fixture = path.join(output, name);
    for (const file of Object.values(SWIFT_LOCKS)) {
      mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
      writeFileSync(path.join(fixture, file), JSON.stringify({ version: 2, pins: [{
        identity: 'capacitor-swift-pm', kind: 'remoteSourceControl',
        location: 'https://github.com/ionic-team/capacitor-swift-pm.git',
        state: { version, revision: '0'.repeat(40) } }] }));
    }
    results[name] = scanSwiftLocks({ root: fixture, output: path.join(fixture, 'results'), trivy: binary,
      cache: path.join(root, '.cache/ios-security-trivy') });
  }
  const ghsa = 'GHSA-rvm3-566m-v7fv';
  if (!results.vulnerable.findings.some(row => row.advisory === ghsa)
    || results.fixed.findings.some(row => row.advisory === ghsa)
    || Object.values(results).some(row => row.status === 'error')) throw new Error('Real Trivy Swift positive/fixed control failed');
  const source = await readOfficialSource('https://api.github.com/repos/sqlcipher/sqlcipher/releases?per_page=100', { token });
  writeFileSync(path.join(output, 'sqlcipher-releases.raw'), source.text);
  const releases = releaseMetadata(source.text);
  results.sqlcipher = { vulnerable: assessSqlcipherRelease(releases, '4.17.0'), fixed: assessSqlcipherRelease(releases, '4.19.0'),
    source: { ...source, text: undefined } };
  try {
    await readOfficialSource('https://api.github.com/repos/sqlcipher/sqlcipher/releases/tags/nonexistent-security-positive-control', { token });
    throw new Error('Expected HTTP 404 was not observed');
  } catch (error) {
    if (!error.message.includes('HTTP 404')) throw error;
    results.sourceFailure = { status: 'error', expectedControl: true, reason: error.message };
  }
  writeFileSync(path.join(output, 'controls.json'), `${JSON.stringify(results, null, 2)}\n`);
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Usage: ios-security-controls.mjs OUTPUT');
  await runIosSecurityControls({ root: process.cwd(), output: path.resolve(process.argv[2]),
    token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN, trivy: process.env.FOLIOLE_TRIVY_BIN });
  console.log('Real Swift GHSA, SQLCipher vendor and HTTP failure controls passed');
}
