/* global console */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import semver from './ios-security-semver.mjs';
import { captureSecurityCandidate, sameSecurityCandidate, digest } from '../security/security-inputs.mjs';
import { collectSwiftSecurityInventory } from './swift-security-inventory.mjs';
import { scanSwiftLocks } from './swift-vulnerability-scan.mjs';
import { collectIosOfficialSecurity } from './ios-official-security.mjs';
import { collectIosEnvironment } from './ios-security-environment.mjs';
import { assessSqliteAdvisories } from './ios-vendor-metadata.mjs';
import { mergeIosSecurityCoverage } from './ios-security-coverage.mjs';
import { ensureIosTrivy } from './ios-security-trivy.mjs';

export async function collectIosSecurityMaintenance({ root, output, trivy, cache, resolve = false,
  device = false, deviceId, deviceName, token, now = Date.now() }) {
  if (device && !deviceId) throw new Error('Device security collection requires an explicit device ID');
  mkdirSync(output, { recursive: true });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const candidate = captureSecurityCandidate(root, git);
  const inventory = collectSwiftSecurityInventory({ root, output: path.join(output, 'inventory'), resolve });
  let scanner;
  try {
    scanner = scanSwiftLocks({ root, output: path.join(output, 'scan'),
      trivy: trivy ?? await ensureIosTrivy({ root }), cache: cache ?? path.join(root, '.cache/ios-security-trivy'), now });
  } catch (error) {
    scanner = { status: 'error', findings: [], graphs: {}, errors: [error.message] };
  }
  const pins = [...new Map(Object.values(inventory.graphs).flatMap(graph => graph.pins ?? [])
    .map(pin => [`${pin.identity}:${pin.version}:${pin.revision}`, pin])).values()];
  const official = await collectIosOfficialSecurity({ pins, output: path.join(output, 'official'), token, now });
  const environment = collectIosEnvironment({ root, inventory, device, deviceId, deviceName });
  const report = { schemaVersion: 1, platform: 'ios', checkedAt: new Date(now).toISOString(),
    candidate, inventory, scanner, official, environment, errors: [], status: 'incomplete' };
  if (!sameSecurityCandidate(candidate, captureSecurityCandidate(root, git))) {
    report.errors.push({ reason: 'Candidate inputs changed during collection; rerun' });
  }
  report.checks = iosMaintenanceChecks(report);
  writeFileSync(path.join(output, 'ios-security.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function iosMaintenanceChecks(report) {
  const { official, inventory, scanner, environment } = report;
  const base = { candidate: report.candidate, checkedAt: report.checkedAt };
  const make = (asset, route, status, reason, findings, evidence) => ({ ...base, asset, route, status,
    reason, findings, source: 'iOS fixed maintenance: Trivy GHSA / upstream official metadata',
    environment: digest(JSON.stringify(environment)), evidence });
  const sourceErrors = official.errors.map(row => `${row.id}: ${row.reason}`).join('; ');
  const nativeErrors = (environment.errors ?? []).map(row => `${row.key}: ${row.reason}`).join('; ');
  const swiftFindings = [...scanner.findings, ...official.findings.filter(row => row.package !== 'sqlcipher/sqlcipher')];
  const sqlite = environment.components?.sqlcipher?.sqlite;
  const embeddedFindings = [...official.findings.filter(row => row.package === 'sqlcipher/sqlcipher'),
    ...(sqlite && official.sqlite ? assessSqliteAdvisories(official.sqlite, sqlite) : [])];
  const sourceStatus = sourceErrors || report.errors.length || scanner.status === 'error' ? 'error' : 'findings';
  const gap = (asset, reason) => ({ platform: 'ios', advisory: 'coverage-review-required',
    package: `foliole/${asset}`, versions: ['unqualified'], severity: 'info',
    source: asset === 'swift-native' ? 'https://github.com/ionic-team/capacitor/security/advisories'
      : asset === 'embedded-native' ? 'https://www.zetetic.net/blog/' : 'https://support.apple.com/en-us/100100', assessment: reason });
  return [make('swift-native', 'resolution', inventory.status === 'resolved' ? 'clean' : inventory.status === 'error' ? 'error' : 'unsupported',
    inventory.status === 'resolved' ? 'Both live graphs and local plugin edges qualified'
      : JSON.stringify(inventory.errors ?? []) + '; Live Mac App/host graph resolution unavailable',
    [], { graphs: inventory.graphs, inputs: inventory.inputs }),
  make('swift-native', 'official-review', sourceStatus,
    sourceErrors || scanner.errors.join('; ') || 'GHSA scan qualified; vendor-only notices, upstream advisory applicability and Cordova fork require review',
    [...swiftFindings, gap('swift-native', 'Vendor-only notices, package applicability and independent Cordova source version remain unqualified')],
    { scanner, sources: official.sources, packages: official.packages, gaps: official.gaps }),
  make('embedded-native', 'official-review', sourceErrors || nativeErrors ? 'error' : 'findings',
    sourceErrors || nativeErrors || 'iOS slice only: SQLCipher vendor predicate and SQLite fixes checked; system crypto and other platforms require separate evidence',
    [...embeddedFindings, gap('embedded-native', 'iOS component evidence does not attest other platforms or OS cryptographic internals')],
    { versions: environment.components, sources: official.sources.filter(row => /sqlcipher|sqlite/u.test(row.id)) }),
  make('apple-tools', 'official-review', sourceErrors || nativeErrors ? 'error' : 'findings',
    sourceErrors || nativeErrors || 'Actual tools/SDK recorded for this host only; published security releases require applicability review',
    [...appleUpdateReviews(official.appleSecurity ?? [], environment, 'tools'), gap('apple-tools', 'Only this environment was observed; security advisory applicability requires review')],
    { tools: environment.tools, sources: official.apple }),
  make('apple-os-webkit', 'official-review', sourceErrors || nativeErrors ? 'error' : 'findings',
    sourceErrors || nativeErrors || 'Device/host OS ownership recorded; WebKit and Common Crypto follow system security updates, exposure remains unqualified',
    [...appleUpdateReviews(official.appleSecurity ?? [], environment, 'os'), gap('apple-os-webkit', 'System WebKit/Common Crypto follow OS security updates; exploitability not attested')],
    { device: environment.device, macOS: environment.tools.macOS, releases: official.appleSecurity })];
}

export function appleUpdateReviews(releases, environment, scope) {
  const xcode = /^Xcode ([\d.]+)/u.exec(environment.tools.xcode ?? '')?.[1];
  const macOS = /ProductVersion:\s*([\d.]+)/u.exec(environment.tools.macOS ?? '')?.[1];
  const devices = scope === 'tools' ? [['Xcode', xcode]] : [['macOS', macOS],
    ['iOS', environment.device?.status === 'observed' ? environment.device.os : undefined]];
  return devices.flatMap(([product, installed]) => !installed ? [] : releases.flatMap(row => {
    const version = new RegExp(`^${product}(?: [A-Za-z]+)? ([\\d.]+)`, 'u').exec(row.title)?.[1];
    if (!version || !semver.coerce(version) || !semver.coerce(installed)
      || !semver.gt(semver.coerce(version), semver.coerce(installed))) return [];
    return [{ platform: 'ios', package: `apple/${product.toLowerCase()}`, versions: [installed], severity: 'info',
      advisory: `security-release-${version}`, source: row.source,
      assessment: 'Newer official security release: applicability/support-branch review required; not a confirmed vulnerability' }];
  }));
}

export async function runIosSecurityMaintenanceCli(argv, { deviceName } = {}) {
  const [output, ...flags] = argv;
  const deviceIndex = flags.indexOf('--device');
  const deviceId = deviceIndex < 0 ? undefined : flags.splice(deviceIndex, 2)[1];
  const baseIndex = flags.indexOf('--base-coverage');
  const baseFile = baseIndex < 0 ? undefined : flags.splice(baseIndex, 2)[1];
  if (!output || baseIndex >= 0 && !baseFile || deviceIndex >= 0 && (!deviceId || deviceId.startsWith('--'))
      || flags.some(flag => flag !== '--resolve')) {
    throw new Error('Usage: ios-security-maintenance.mjs OUTPUT [--resolve] [--device UDID] [--base-coverage FILE]; set FOLIOLE_TRIVY_BIN');
  }
  const report = await collectIosSecurityMaintenance({ root: process.cwd(), output: path.resolve(output),
    trivy: process.env.FOLIOLE_TRIVY_BIN ?? await ensureIosTrivy({ root: process.cwd() }), cache: path.resolve('.cache/ios-security-trivy'),
    token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN, resolve: flags.includes('--resolve'), device: Boolean(deviceId), deviceId, deviceName });
  console.log(JSON.stringify({ status: report.status, output, scanner: report.scanner.status,
    errors: report.official.errors, findings: report.checks.flatMap(check => check.findings).length }));
  if (baseFile) {
    const coverage = mergeIosSecurityCoverage(JSON.parse(readFileSync(baseFile, 'utf8')), report);
    writeFileSync(path.join(path.resolve(output), 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  }
  process.exitCode = report.errors.length || report.checks.some(check => check.status === 'error') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runIosSecurityMaintenanceCli(process.argv.slice(2));
}
