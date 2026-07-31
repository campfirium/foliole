// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = fs.readFileSync('.github/workflows/release-windows.yml', 'utf8');
const parsedWorkflow = parse(workflow);

describe('release Windows workflow contract', () => {
  it('requires one explicit version and exact SHA for every packaging mode', () => {
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_version).toMatchObject({ required: true, type: 'string' });
    expect(parsedWorkflow.on.workflow_dispatch.inputs.target_sha).toMatchObject({ required: true, type: 'string' });
    expect(workflow).toContain('ref: ${{ inputs.target_sha }}');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_VERSION: ${{ inputs.target_version }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_TARGET_SHA: ${{ inputs.target_sha }}');
    expect(workflow).toContain('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
    expect(workflow).toContain('run: node scripts/release-target-contract.mjs');
    expect(workflow).not.toContain('release_ref:');
  });

  it('serializes and creates drafts by the declared version and SHA', () => {
    expect(workflow).toContain('group: release-windows-${{ inputs.target_version }}-${{ inputs.target_sha }}');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('$targetVersion = "${{ inputs.target_version }}"');
    expect(workflow).toContain('$targetCommit = "${{ inputs.target_sha }}"');
    expect(workflow).toContain('gh release create $tagName');
    expect(workflow).toContain('--target $targetCommit');
  });

  it('signs the application and installer before installed-app smoke and publication', () => {
    expect(workflow).toContain('uses: azure/login@v3');
    expect(workflow).toContain('write-artifact-signing-builder-config.mjs');
    expect(workflow).toContain('npm run windows:package');
    expect(workflow).toContain('node scripts/windows/package-windows.mjs --install-existing');
    expect(workflow).toContain('verify-artifact-signatures.mjs --root artifacts/windows/win-unpacked');
    expect(workflow).toContain('verify-artifact-signatures.mjs --root artifacts/windows --extensions exe');
    expect(workflow).not.toContain('azure/artifact-signing-action');
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
