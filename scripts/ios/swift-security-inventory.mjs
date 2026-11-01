/* global process, console */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareIosAcceptanceCache, prepareIosRuntimeContractCache } from './ios-local-storage.mjs';
import { SWIFT_LOCKS, swiftPins, compareSwiftResolution, swiftManifestEvidence,
  checkSwiftManifestCoverage, swiftHostNodes } from './swift-security-evidence.mjs';

export function collectSwiftSecurityInventory({ root, output, resolve = false }) {
  mkdirSync(output, { recursive: true });
  const report = { schemaVersion: 1, platform: 'ios', startedAt: new Date().toISOString(),
    mode: resolve ? 'mac-resolution' : 'locks-only', overallStatus: 'incomplete',
    automatedAdvisories: { status: 'unsupported', reason: 'no-qualified-Swift-advisory-query' },
    officialReview: { status: 'required', reason: 'dated-upstream-review-is-a-separate-result' },
    gaps: ['OS/WebKit and Xcode require official vendor review',
      'Embedded binary component versions require separate evidence',
      ...(resolve ? [] : ['Local/plugin dependency edges and live macOS resolution are unverified'])],
    environment: { platform: process.platform, arch: process.arch }, inputs: {}, graphs: {}, errors: [] };
  const toolEnv = { ...process.env };
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'], env: toolEnv
  }).trim();
  const hash = file => createHash('sha256').update(readFileSync(path.resolve(root, file))).digest('hex');
  const json = file => JSON.parse(readFileSync(path.resolve(root, file), 'utf8'));
  const capture = file => { report.inputs[file] ??= hash(file); };
  try {
    report.source = { revision: run('git', ['rev-parse', 'HEAD']),
      worktreeDirty: Boolean(run('git', ['status', '--porcelain'])) };
    for (const file of ['package-lock.json', 'ios/App/App.xcodeproj/project.pbxproj']) capture(file);
    for (const [name, file] of Object.entries(SWIFT_LOCKS)) {
      capture(file);
      report.graphs[name] = { status: 'lock-evidence', lock: file, pins: swiftPins(json(file)) };
    }
    if (resolve) resolveGraphs({ root, output, report, run, json, capture, toolEnv });
    for (const [file, before] of Object.entries(report.inputs)) {
      if (hash(file) !== before) report.errors.push({ reason: 'input-changed-during-collection', file });
    }
    if (run('git', ['rev-parse', 'HEAD']) !== report.source.revision) {
      report.errors.push({ reason: 'revision-changed-during-collection' });
    }
  } catch (error) {
    report.errors.push({ reason: 'collection-failed', message: error.message,
      stderr: error.stderr?.toString() });
  }
  report.status = report.errors.length ? 'error' : resolve ? 'resolved' : 'lock-evidence';
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(output, 'inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function resolveGraphs({ root, output, report, run, json, capture, toolEnv }) {
  if (process.platform !== 'darwin') throw new Error('Live App resolution requires macOS/Xcode');
  report.environment.xcode = run('xcodebuild', ['-version']);
  report.environment.swift = run('swift', ['--version']);
  const appCache = prepareIosAcceptanceCache(root);
  const hostCache = prepareIosRuntimeContractCache(root);
  Object.assign(toolEnv, { CLANG_MODULE_CACHE_PATH: hostCache.clangModuleCache,
    SWIFTPM_MODULECACHE_OVERRIDE: hostCache.swiftpmModuleCache });
  const roots = ['ios/App/CapApp-SPM', 'ios/App/FramedSyncRuntimePackage']
    .map(directory => path.join(root, directory));
  // Hash local inputs before resolution, including npm-owned manifests, without editing them.
  collectManifests([...roots, path.join(root, 'ios/App')], run, capture, hostCache.scratchPath);
  const appLog = run('xcodebuild', ['-resolvePackageDependencies', '-project',
    'ios/App/App.xcodeproj', '-scheme', 'App', '-onlyUsePackageVersionsFromResolvedFile',
    '-derivedDataPath', appCache.derivedData, '-clonedSourcePackagesDirPath', appCache.sourcePackages]);
  writeFileSync(path.join(output, 'xcode-resolution.log'), appLog);
  const workspace = json(path.join(appCache.sourcePackages, 'workspace-state.json'));
  const dependencies = workspace.object?.dependencies;
  if (!Array.isArray(dependencies)) throw new Error('Unrecognized Xcode workspace resolution state');
  report.graphs.app.resolved = dependencies.filter(row => row.packageRef.kind === 'remoteSourceControl')
    .map(row => ({ identity: row.packageRef.identity, url: row.packageRef.location,
      ...row.state.checkoutState }));
  report.graphs.app.artifacts = workspace.object.artifacts;
  const remoteRoots = dependencies.filter(row => row.packageRef.kind === 'remoteSourceControl')
    .map(row => path.join(appCache.sourcePackages, 'checkouts', row.subpath));
  const localRoots = dependencies.filter(row => row.packageRef.kind === 'fileSystem')
    .map(row => row.packageRef.location);
  report.graphs.app.manifests = collectManifests(
    [...roots, ...localRoots, ...remoteRoots], run, capture, hostCache.scratchPath);
  qualifyGraph(report, 'app');
  resolveHost({ report, run, capture, output, hostCache });
}

function collectManifests(roots, run, capture, scratchPath) {
  const manifests = new Map();
  function visit(directory) {
    const key = path.resolve(directory);
    if (manifests.has(key)) return;
    const source = path.join(directory, 'Package.swift');
    capture(source);
    const scratch = path.join(scratchPath, 'manifest-evidence',
      createHash('sha256').update(key).digest('hex').slice(0, 16));
    const dump = JSON.parse(run('swift', ['package', '--package-path', directory,
      '--scratch-path', scratch, 'dump-package']));
    const manifest = swiftManifestEvidence(dump, source);
    manifests.set(key, manifest);
    for (const edge of manifest.edges) if (edge.kind === 'local') visit(edge.path);
  }
  for (const directory of roots) visit(directory);
  return [...manifests.values()];
}

function resolveHost({ report, run, capture, output, hostCache }) {
  const raw = run('swift', ['package', '--package-path', 'ios/App', '--scratch-path',
    hostCache.scratchPath, '--force-resolved-versions', 'show-dependencies', '--format', 'json']);
  writeFileSync(path.join(output, 'host-graph.json'), raw);
  const tree = JSON.parse(raw);
  report.graphs.host.tree = tree;
  report.graphs.host.resolved = swiftHostNodes(tree, directory => run('git', ['-C', directory, 'rev-parse', 'HEAD']));
  const directories = new Set();
  function visit(node) { directories.add(node.path); for (const child of node.dependencies) visit(child); }
  visit(tree);
  report.graphs.host.manifests = collectManifests([...directories], run, capture, hostCache.scratchPath);
  qualifyGraph(report, 'host');
}

function qualifyGraph(report, name) {
  const graph = report.graphs[name];
  const errors = [...compareSwiftResolution(graph.pins, graph.resolved),
    ...checkSwiftManifestCoverage(graph.pins, graph.manifests)];
  report.errors.push(...errors.map(error => ({ graph: name, ...error })));
  graph.status = errors.length ? 'error' : 'resolved';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output = args.find(arg => !arg.startsWith('--'));
  if (!output || args.some(arg => arg.startsWith('--') && arg !== '--resolve')) {
    throw new Error('Usage: node scripts/ios/swift-security-inventory.mjs <output-dir> [--resolve]');
  }
  const report = collectSwiftSecurityInventory({ root: process.cwd(),
    output: path.resolve(output), resolve: args.includes('--resolve') });
  console.log(JSON.stringify({ status: report.status, overallStatus: report.overallStatus,
    errors: report.errors.length, output }));
  process.exitCode = report.errors.length ? 1 : 0;
}
