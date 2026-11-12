// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LOCK = 'package-lock.json';
const PREVIEWS = 'src/shared/config/featurePreviews.json';
const FILES = [
  '.githooks/pre-push',
  '.github/release-intent.json',
  '.github/release-platforms.json',
  'android/app/build.gradle',
  'ios/App/App/Info.plist',
  'ios/App/App.xcodeproj/project.pbxproj',
  'package.json',
  LOCK,
  PREVIEWS,
  'releases/update-manifest.json',
  'scripts/check-release-candidate.mjs',
  'scripts/git/check-commit-sequence.mjs',
  'scripts/git/commit-sequence-history.mjs',
  'scripts/git/remote-commit.mjs',
  'scripts/lib/path-domain-registry.mjs',
  'scripts/lib/path-domains.mjs',
  'scripts/mobile-store-identity-contract.mjs',
  'scripts/pre-push-affected-validation.mjs',
  'scripts/quality/quality-command-contract-data.mjs',
  'scripts/quality/quality-command-contracts.mjs',
  'scripts/release-platform-contract.mjs',
  'scripts/release-publication-contract.mjs'
];

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function writePreviews(repo, name, visibility) {
  writeFileSync(join(repo, PREVIEWS), JSON.stringify({ test: { name, visibility } }));
}

function prepareRepo(repo, remote) {
  git(repo, 'init', '-b', 'dev');
  git(repo, 'config', 'user.name', 'Release Test');
  git(repo, 'config', 'user.email', 'release@example.com');
  git(repo, 'config', 'core.hooksPath', '.githooks');
  for (const file of FILES) {
    const destination = join(repo, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(ROOT, file), destination);
  }
  writePreviews(repo, 'Dev preview', 'internal');
  git(repo, 'add', '--', ...FILES);
  git(repo, 'commit', '-m', '000001 seed development checkout');
  git(repo, 'switch', '-c', 'release');
  writePreviews(repo, 'Candidate preview', 'public');
  git(repo, 'add', '--', PREVIEWS);
  git(repo, 'commit', '-m', '000002 freeze release candidate');
  git(repo, 'switch', 'dev');
  git(repo, 'init', '--bare', remote);
}

it('checks committed configuration and previews through the real pre-push hook', {
  meta: { calibratedMs: 30_000 }
}, () => {
  const repo = mkdtempSync(join(tmpdir(), 'release-pre-push-'));
  const remote = join(repo, '.git', 'remote.git');
  const push = () => spawnSync('git', ['push', remote, 'release'], { cwd: repo, encoding: 'utf8' });
  const badLock = '{"version":"0.0.0"}\n';
  try {
    prepareRepo(repo, remote);
    const goodCommit = git(repo, 'rev-parse', 'release');
    const goodLock = readFileSync(join(repo, LOCK));
    writeFileSync(join(repo, LOCK), badLock);
    writePreviews(repo, 'Working tree preview', 'invalid');
    const accepted = push();
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.stdout).toContain('Candidate preview');
    expect(accepted.stdout).not.toContain('Working tree preview');
    expect(git(remote, 'rev-parse', 'refs/heads/release')).toBe(goodCommit);

    git(repo, 'restore', '--', PREVIEWS);
    git(repo, 'switch', 'release');
    git(repo, 'add', '--', LOCK);
    git(repo, 'commit', '-m', '000003 invalidate committed lockfile');
    writeFileSync(join(repo, LOCK), goodLock);
    const rejectedLock = push();
    expect(rejectedLock.status).not.toBe(0);
    expect(rejectedLock.stderr).toContain('package-lock.json root versions must match');

    writePreviews(repo, 'Invalid candidate preview', 'invalid');
    git(repo, 'add', '--', LOCK, PREVIEWS);
    git(repo, 'commit', '-m', '000004 invalidate committed preview');
    writePreviews(repo, 'Working tree preview', 'public');
    const rejectedPreview = push();
    expect(rejectedPreview.status).not.toBe(0);
    expect(rejectedPreview.stderr).toContain('Invalid visibility for feature preview: Invalid candidate preview');
    expect(git(remote, 'rev-parse', 'refs/heads/release')).toBe(goodCommit);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
