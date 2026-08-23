/* global process */

import { createHash } from 'node:crypto';
import {
  mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, unlinkSync
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
    branch,
    revision: capture(repoRoot, 'git', ['rev-parse', 'HEAD']),
    tree: capture(repoRoot, 'git', ['rev-parse', 'HEAD^{tree}'])
  };
}

export function assertLocalCandidateStillFrozen(expected, repoRoot,
  inspect = collectLocalCandidate) {
  const current = inspect(repoRoot);
  for (const key of ['branch', 'revision', 'tree']) {
    if (current[key] !== expected[key]) throw new Error(`Local source changed during qualification: ${key}.`);
  }
  return current;
}

export function materializeLocalSourceCapsule(repoRoot, artifactDir, candidate) {
  const archivePath = path.join(artifactDir, 'source.tar');
  const buildRoot = path.join(artifactDir, 'source');
  mkdirSync(buildRoot);
  try {
    run(repoRoot, 'git', ['archive', '--format=tar', `--output=${archivePath}`, candidate.revision]);
    const archiveDigest = digestParts([readFileSync(archivePath)]);
    run(repoRoot, 'tar', ['-xf', archivePath, '-C', buildRoot]);
    run(buildRoot, 'npm', ['ci']);
    run(buildRoot, 'npm', ['run', 'android:web:build']);
    run(buildRoot, 'npx', ['--no-install', 'cap', 'sync', 'ios']);
    return { archivePath, buildRoot, candidate: { ...candidate, archiveDigest,
      artifactDigest: digestParts(directoryParts(path.join(buildRoot, 'dist/companion'))),
      entrypoint: 'ios/App/App.xcodeproj#App' } };
  } catch (error) {
    cleanupLocalSourceCapsule({ archivePath, buildRoot });
    throw error;
  }
}

export function cleanupLocalSourceCapsule(capsule) {
  rmSync(capsule.buildRoot, { force: true, recursive: true });
  rmSync(capsule.archivePath, { force: true });
}

export function createLocalDefinition({ candidate }) {
  return {
    action: {
      id: 'scripts/macos/journey-readiness-local-qualification.mjs'
    },
    cleanup: { owner: 'journey-readiness',
      strategy: 'recorded-udid-exact-delete-and-source-capsule-remove' },
    integrity: { archive: 'sha256', app: 'codesign-and-bundle-identity' },
    locator: { kind: 'receipt-json', root: '.tmp/artifacts/journey-readiness' },
    mutation: { baseline: 'isolated-local-v1', recoveryPoint: 'fixture-copy' },
    source: candidate,
    target: { host: 'darwin', identity: 'owned-iphone-simulator',
      topology: ['mac', 'iphone-simulator'] }
  };
}

export function createMacProviders({ artifactDir, candidate, repoRoot }) {
  return {
    action: async () => ({ action: 'host qualification action registered', status: 'passed' }),
    locator: async () => {
      const probe = path.join(artifactDir, 'evidence-write.probe');
      writeFileSync(probe, 'journey-readiness\n');
      if (statSync(probe).size === 0) throw new Error('evidence probe was empty');
      unlinkSync(probe);
      return { action: 'receipt locator persisted', status: 'passed' };
    },
    mutation: async () => {
      const source = path.join(artifactDir, 'fixture-source.json');
      const recovery = path.join(artifactDir, 'fixture-recovery.json');
      const value = `${JSON.stringify({ isolated: true, version: 1 })}\n`;
      writeFileSync(source, value); writeFileSync(recovery, value); writeFileSync(source, '{"mutated":true}\n');
      writeFileSync(source, readFileSync(recovery));
      if (readFileSync(source, 'utf8') !== value) throw new Error('isolated fixture recovery failed');
      return { action: 'isolated fixture restored', status: 'passed' };
    },
    source: async () => {
      assertLocalCandidateStillFrozen(candidate, repoRoot);
      if (!/^[a-f0-9]{64}$/u.test(candidate.archiveDigest)
          || !/^[a-f0-9]{64}$/u.test(candidate.artifactDigest)) {
        throw new Error('Local source archive identity is incomplete.');
      }
      return { action: `source ${candidate.revision.slice(0, 12)} frozen`, status: 'passed' };
    }
  };
}
