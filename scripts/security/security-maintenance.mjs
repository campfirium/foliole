/* global console */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createCoverageReport } from './security-coverage.mjs';
import { npmAuditObservation } from './npm-security-evidence.mjs';
import { digest, securityInputIdentity, workflowReferences } from './security-inputs.mjs';
import { officialSecurityObservations } from './official-security-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

function nativeObservation(asset, file, snapshot, observations) {
  const route = asset === 'android-maven' ? 'osv-maven' : 'resolution';
  let evidence;
  try {
    evidence = readJson(file);
    if (evidence.schemaVersion !== 1 || evidence.platform !== (asset === 'android-maven' ? 'android' : 'ios')) {
      throw new Error('Malformed native evidence schema/platform');
    }
    if (asset === 'android-maven' && (!evidence.inventory?.configurations?.length
      || !evidence.inventory.gradleVersion || !evidence.inventory.java?.version
      || !Array.isArray(evidence.findings) || !Array.isArray(evidence.errors))) {
      throw new Error('Incomplete Android evidence inventory');
    }
    if (asset === 'swift-native' && evidence.status === 'resolved'
      && ['app', 'host'].some(name => evidence.graphs?.[name]?.status !== 'resolved')) {
      throw new Error('Swift evidence is missing a resolved graph');
    }
    if (asset === 'android-maven') {
      for (const check of evidence.officialObservations ?? []) {
        if (!(check.asset === 'embedded-native' && check.route === 'component-notices')
          && !(check.asset === 'android-maven' && check.route === 'dependency-submission')
          && !(['gradle', 'embedded-native', 'jdk', 'android-tools', 'android-os-webview'].includes(check.asset) && check.route === 'vendor-notices')) {
          throw new Error('Unsupported Android official observation');
        }
        const environment = digest(JSON.stringify(check.evidence?.versions ?? {}));
        snapshot.environments[`${check.asset}:${check.route}`] = environment;
        observations.push({ ...check, candidate: evidence.source, environment });
      }
    }
    const facts = asset === 'android-maven' ? evidence.inventory : evidence.environment;
    snapshot.nativeEvidence[asset] = { file, sha256: digest(readFileSync(file)), facts };
    snapshot.environments[asset] = digest(JSON.stringify(facts));
    snapshot.environments[`${asset}:${route}`] = snapshot.environments[asset];
    return { asset, route,
      candidate: { revision: evidence.source?.revision, inputDigest: evidence.source?.inputDigest },
      environment: snapshot.environments[asset], checkedAt: evidence.generatedAt ?? evidence.finishedAt,
      status: asset === 'android-maven' ? evidence.status : evidence.status === 'resolved' ? 'clean' : 'unsupported',
      source: asset === 'android-maven' ? 'resolved Gradle / OSV Maven' : 'Swift App and host resolution (automated advisories unsupported)',
      findings: evidence.findings ?? [], gaps: evidence.gaps ?? [],
      reason: asset === 'swift-native' && evidence.status !== 'resolved' ? 'matching-live-resolution-unavailable' : undefined };
  } catch (error) { return { asset, route, status: 'error', reason: error.message,
    findings: Array.isArray(evidence?.findings) ? evidence.findings : [] }; }
}

export function collectSecurityMaintenance({ root, output, nativeReports = {}, officialReview, now = Date.now(),
  run = (command, args, options) => spawnSync(command, args, options),
  git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() }) {
  mkdirSync(output, { recursive: true });
  const tracked = git(['ls-files']).split('\n');
  const identity = securityInputIdentity(root, tracked);
  const revision = git(['rev-parse', 'HEAD']);
  const lock = readJson(path.join(root, 'package-lock.json'));
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmVersion = run(npmCommand, ['--version'], { cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  const tools = { node: process.version, npm: npmVersion.status === 0 ? npmVersion.stdout.trim() : 'unavailable',
    declaredPackageManager: readJson(path.join(root, 'package.json')).packageManager,
    platform: process.platform, arch: process.arch, osKernel: os.release() };
  const environment = digest(JSON.stringify(tools));
  const snapshot = { candidate: { revision, inputDigest: identity.inputDigest },
    mode: git(['status', '--porcelain']) ? 'working-tree' : 'committed',
    inputs: identity.files, tools, environments: { 'npm-runtime': environment, 'npm-build': environment },
    declaredPackages: Object.fromEntries(['electron', '@capacitor/core', '@capacitor-community/sqlite']
      .map(name => [name, lock.packages?.[`node_modules/${name}`]?.version ?? 'unknown'])),
    actions: workflowReferences(root), nativeEvidence: {} };
  const observations = ['npm-runtime', 'npm-build'].map(asset => {
    const args = ['audit', '--package-lock-only', '--json', '--ignore-scripts',
      asset === 'npm-runtime' ? '--omit=dev' : '--include=dev'];
    const result = run(npmCommand, args,
      { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    writeFileSync(path.join(output, `${asset}.json`), result.stdout || '{}');
    return npmAuditObservation(result, { asset, candidate: snapshot.candidate,
      environment, checkedAt: new Date(now).toISOString() });
  });
  observations.push(...Object.entries(nativeReports).map(([asset, file]) => nativeObservation(asset, file, snapshot, observations)));
  observations.push(...officialSecurityObservations(officialReview, snapshot));
  const report = createCoverageReport({ snapshot, observations, now });
  if (tools.npm === 'unavailable' || snapshot.actions.errors.length) {
    report.overallStatus = 'incomplete';
    report.limitations.push('Tool version or workflow extraction failed; inspect snapshot details.');
  }
  if (securityInputIdentity(root, tracked).inputDigest !== identity.inputDigest
    || git(['rev-parse', 'HEAD']) !== revision) {
    report.overallStatus = 'incomplete';
    report.limitations.push('Inputs or revision changed during collection; rerun this observation.');
  }
  writeFileSync(path.join(output, 'coverage.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [output, ...args] = process.argv.slice(2);
    if (!output || args.length % 2) throw new Error('Usage: security-maintenance.mjs OUTPUT [--android-report FILE] [--swift-report FILE] [--official-review FILE]');
    const nativeReports = {};
    let officialReview;
    for (let index = 0; index < args.length; index += 2) {
      if (args[index] === '--official-review' && !officialReview) { officialReview = args[index + 1]; continue; }
      const asset = { '--android-report': 'android-maven', '--swift-report': 'swift-native' }[args[index]];
      if (!asset || nativeReports[asset]) throw new Error(`Unknown/duplicate option: ${args[index]}`);
      nativeReports[asset] = args[index + 1];
    }
    const report = collectSecurityMaintenance({ root, output: path.resolve(output), nativeReports, officialReview });
    console.log(JSON.stringify({ report: path.resolve(output, 'coverage.json'), status: report.overallStatus,
      findings: report.findings.map(row => row.id), gaps: report.gaps.map(row => row.id) }));
    if (report.overallStatus !== 'clean') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
