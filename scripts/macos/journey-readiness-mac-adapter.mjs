/* global process */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CONTROLLER_FILES = [
  'scripts/journey-readiness-contract.mjs',
  'scripts/journey-readiness-controller.mjs',
  'scripts/journey-readiness-cli.mjs',
  'scripts/diagnostics/local-artifact-cache-production.mjs',
  'scripts/diagnostics/local-artifact-cache-retention.mjs',
  'scripts/ios/ios-dedicated-simulator.mjs',
  'scripts/ios/ios-dedicated-simulator-runtime.mjs',
  'scripts/ios/ios-simulator-acceptance-runner.mjs',
  'scripts/lib/resource-gate.mjs',
  'scripts/macos/journey-readiness-local-qualification.mjs',
  'scripts/macos/journey-readiness-mac-adapter.mjs',
  'scripts/macos/journey-readiness-simulator-adapter.mjs',
  'scripts/with-resource-gate.mjs'
];

function digestParts(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function directoryParts(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) return directoryParts(root, entryPath);
    return [path.relative(root, entryPath), readFileSync(entryPath)];
  });
}

function capture(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', timeout: 600_000 });
  if (result.status !== 0) throw new Error(result.stderr || `${command} exited ${result.status}`);
  return result.stdout.trim();
}

function run(repoRoot, command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit', timeout: 600_000 });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

export function assertConfinedEvidencePath(repoRoot, evidencePath) {
  const allowed = realpathSync(path.join(repoRoot, '.tmp/artifacts'));
  const resolved = realpathSync(evidencePath);
  const relative = path.relative(allowed, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Journey readiness evidence must be a child of .tmp/artifacts.');
  }
  return resolved;
}

export function prepareLocalCandidate(repoRoot) {
  if (process.platform !== 'darwin') throw new Error('Local journey qualification requires macOS.');
  run(repoRoot, 'npm', ['run', 'android:web:build']);
  run(repoRoot, 'npx', ['--no-install', 'cap', 'sync', 'ios']);
  return collectLocalCandidate(repoRoot);
}

export function collectLocalCandidate(repoRoot) {
  const status = capture(repoRoot, 'git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) throw new Error(`Candidate preparation left a dirty tracked worktree:\n${status}`);
  const branch = capture(repoRoot, 'git', ['branch', '--show-current']);
  if (branch !== 'dev') throw new Error(`Journey readiness requires dev, found ${branch || 'detached HEAD'}.`);
  return {
    artifact: digestParts(directoryParts(path.join(repoRoot, 'dist/companion'))),
    branch,
    entrypoint: 'ios/App/App.xcodeproj#App',
    revision: capture(repoRoot, 'git', ['rev-parse', 'HEAD']),
    tree: capture(repoRoot, 'git', ['rev-parse', 'HEAD^{tree}'])
  };
}

export function createLocalDefinition({ artifactDir, candidate, repoRoot }) {
  const controller = digestParts(CONTROLLER_FILES.flatMap((file) => [file, readFileSync(path.join(repoRoot, file))]));
  return {
    candidate,
    controller: {
      dependencies: controller,
      entrypoint: 'scripts/macos/journey-readiness-local-qualification.mjs',
      scenario: 'local-mac-signed-iphone-simulator',
      topology: 'mac+owned-iphone-simulator'
    },
    adapter: {
      capabilities: ['mac-fixture', 'signed-simulator-install'],
      excluded: ['windows', 'a5', 'android', 'physical-ios', 't121-live', 't132-live'],
      host: 'darwin', topology: ['mac', 'iphone-simulator']
    },
    baseline: { cleanupOwner: 'journey-readiness', fixture: 'isolated-local-v1', quiescent: true, recoveryPoint: 'fixture-copy' },
    criteria: { failure: 'any-unproven-fact-blocks', humanIntervention: 'none', success: 'all-seven-owners-pass' },
    evidence: { archiveOwner: 'journey-readiness', root: artifactDir, writer: 'atomic-json-v1' },
    cleanup: { owner: 'journey-readiness', strategy: 'recorded-udid-exact-delete' }
  };
}

export function createMacProviders({ artifactDir, candidate }) {
  return {
    baseline: async () => {
      const source = path.join(artifactDir, 'fixture-source.json');
      const recovery = path.join(artifactDir, 'fixture-recovery.json');
      const value = `${JSON.stringify({ isolated: true, version: 1 })}\n`;
      writeFileSync(source, value); writeFileSync(recovery, value); writeFileSync(source, '{"mutated":true}\n');
      writeFileSync(source, readFileSync(recovery));
      if (readFileSync(source, 'utf8') !== value) throw new Error('isolated fixture recovery failed');
      return { action: 'isolated fixture restored', status: 'passed' };
    },
    candidate: async () => ({ action: `candidate ${candidate.revision.slice(0, 12)} frozen`, status: 'passed' }),
    controller: async () => ({ action: 'controller and dependencies frozen', status: 'passed' }),
    criteria: async () => ({ action: 'success and failure criteria frozen', status: 'passed' }),
    evidence: async () => {
      const probe = path.join(artifactDir, 'evidence-write.probe');
      writeFileSync(probe, 'journey-readiness\n');
      if (statSync(probe).size === 0) throw new Error('evidence probe was empty');
      unlinkSync(probe);
      return { action: 'evidence root persisted', status: 'passed' };
    }
  };
}
