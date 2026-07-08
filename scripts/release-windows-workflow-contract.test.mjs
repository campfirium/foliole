// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/release-windows.yml', 'utf8');

describe('release Windows workflow contract', () => {
  it('requires an explicit fixed release ref for manual dispatch', () => {
    expect(workflow).toContain('release_ref:');
    expect(workflow).toContain('required: true');
    expect(workflow).toContain('ref: ${{ inputs.release_ref }}');
    expect(workflow).toContain('fetch-depth: 0');
  });

  it('serializes draft release creation by fixed release ref', () => {
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('group: release-windows-${{ inputs.release_ref }}');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('rejects non-release refs before building artifacts', () => {
    expect(workflow).toContain('$releaseRef.StartsWith("release/") -or $releaseRef.StartsWith("v")');
    expect(workflow).toContain('release_ref must be a release branch or version tag.');
  });

  it('requires release branch refs to exactly match the package version', () => {
    expect(workflow).toContain('$expectedBranch = "release/$($package.version)"');
    expect(workflow).toContain('$releaseRef.StartsWith("release/") -and $releaseRef -ne $expectedBranch');
    expect(workflow).not.toContain('$releaseRef.EndsWith($package.version)');
  });

  it('creates the draft release against the checked out release commit', () => {
    expect(workflow).toContain('$targetCommit = (git rev-parse HEAD).Trim()');
    expect(workflow).toContain('gh release create $tagName');
    expect(workflow).toContain('--target $targetCommit');
  });

  it('runs the installed app smoke before publishing the draft release', () => {
    expect(workflow).toContain('Build and install Windows installer');
    expect(workflow).toContain('npm run windows:package:install');
    expect(workflow).toContain('Smoke installed Windows app');
    expect(workflow).toContain('node scripts/windows/installed-app-smoke.mjs');
    expect(workflow).not.toContain('run: npm run release:windows:package');
  });

  it('uses the reviewed release body instead of the placeholder-only body', () => {
    expect(workflow).toContain('$reviewedNotesFile = "releases/github/v$version.md"');
    expect(workflow).toContain('Copy-Item $reviewedNotesFile "artifacts/windows/release-v$version-github-body.md"');
    expect(workflow).toContain('$notesFile = Get-Item -Path "artifacts/windows/release-v$($package.version)-github-body.md"');
    expect(workflow).toContain('--notes-file $notesFile.FullName');
    expect(workflow).not.toContain('--notes $notes');
  });
});
