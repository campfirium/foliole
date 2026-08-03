// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/t7-release.yml', 'utf8');
const workflow = parse(source);

describe('T7 release workflow contract', () => {
  it('is the only exact release push entry and ignores post-public metadata', () => {
    expect(workflow.name).toBe('T7 Release');
    expect(workflow.on.workflow_dispatch).toBeUndefined();
    expect(workflow.on.push.branches).toEqual(['release']);
    expect(workflow.on.push['paths-ignore']).toEqual([
      'releases/github/**', 'releases/notes/**', 'releases/update-manifest.json'
    ]);
    expect(workflow.concurrency).toEqual({
      group: 'foliole-t7-exclusive',
      'cancel-in-progress': true
    });
    expect(source).toContain('FOLIOLE_RELEASE_REF_NAME: ${{ github.ref_name }}');
    expect(source).toContain('FOLIOLE_RELEASE_RUN_SHA: ${{ github.sha }}');
    expect(source).toContain('node scripts/release-target-contract.mjs >> "$GITHUB_OUTPUT"');
    expect(source).toContain('FOLIOLE_RELEASE_EXPECTED_INTENT_DIGEST');
    expect(source).toContain('node scripts/desktop-update-release-policy.mjs');
    expect(fs.existsSync('.github/workflows/publish-release.yml')).toBe(false);
  });

  it('chains one reusable T5 to T6 to RC and parallel package pair', () => {
    const jobs = workflow.jobs;
    expect(jobs.t6_quality.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
    expect(jobs.t6_quality.with.execution_lane).toBe('release-t7');
    expect(jobs.release_candidate.needs).toEqual(['release_context', 't6_quality']);
    expect(jobs.release_candidate.with.target_sha).toBe('${{ needs.t6_quality.outputs.accepted_sha }}');
    expect(jobs.macos_package.needs).toEqual(['release_context', 'release_candidate']);
    expect(jobs.windows_package.needs).toEqual(['release_context', 'release_candidate']);
    expect(jobs.macos_package.with.target_sha)
      .toBe('${{ needs.release_candidate.outputs.accepted_sha }}');
    expect(jobs.windows_package.with.target_sha)
      .toBe('${{ needs.release_candidate.outputs.accepted_sha }}');
    expect(jobs.macos_package.with.updater_baseline_version)
      .toBe('${{ needs.release_context.outputs.macos_updater_baseline_version }}');
    expect(jobs.windows_package.with.updater_baseline_version)
      .toBe('${{ needs.release_context.outputs.windows_updater_baseline_version }}');
    expect(jobs.release_context.outputs.release_scope)
      .toBe('${{ steps.identity.outputs.release_scope }}');
    expect(jobs.release_context.outputs.release_intent_digest)
      .toBe('${{ steps.identity.outputs.release_intent_digest }}');
    expect(jobs.assemble_draft.needs)
      .toEqual(['release_context', 'macos_package', 'windows_package']);
  });

  it('passes only the declared platform secret sets and grants write only to assembly', () => {
    expect(Object.keys(workflow.jobs.macos_package.secrets)).toHaveLength(7);
    expect(Object.keys(workflow.jobs.windows_package.secrets)).toEqual([
      'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID'
    ]);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.macos_package.permissions.contents).toBe('read');
    expect(workflow.jobs.windows_package.permissions.contents).toBe('read');
    expect(workflow.jobs.assemble_draft.permissions).toEqual({ actions: 'read', contents: 'write' });
    expect(source.match(/contents: write/gu)).toHaveLength(1);
  });

  it('downloads only same-run artifacts and verifies SHA, version, and checksums', () => {
    expect(source.match(/uses: actions\/download-artifact@v5/gu)).toHaveLength(2);
    expect(source).not.toContain('run-id:');
    expect(source).not.toContain('repository:');
    expect(source).toContain('test "$MACOS_SHA" = "$TARGET_SHA"');
    expect(source).toContain('test "$WINDOWS_SHA" = "$TARGET_SHA"');
    expect(source.match(/sha256sum --check SHA256SUMS\.txt/gu)).toHaveLength(2);
    expect(source).toContain('grep -Fq "version: ${TARGET_VERSION}"');
    expect(source).toContain('Foliole-macOS-arm64-${TARGET_VERSION}.dmg');
    expect(source).toContain('Foliole-Windows-x64-${TARGET_VERSION}.exe');
    expect(source.match(/node scripts\/desktop-update-artifact-contract\.mjs/gu)).toHaveLength(2);
    expect(source.match(/Foliole-\$\{TARGET_VERSION\}-mac-arm64/gu)).toHaveLength(4);
    expect(source.match(/Foliole-Setup-\$\{TARGET_VERSION\}-win-x64/gu)).toHaveLength(2);
  });

  it('guards stale runs and reconciles only an unpublished draft', () => {
    expect(source).toContain('git ls-remote origin refs/heads/release');
    expect(source).toContain('test "$remote_sha" = "$TARGET_SHA"');
    expect(source).toContain('Another unpublished release draft must be retired first');
    expect(source).toContain('test "$draft_state" = "true"');
    expect(source).toContain('gh release create "$tag" --draft');
    expect(source).toContain('gh release edit "$tag" --target "$TARGET_SHA"');
    expect(source).toContain('gh release delete-asset "$tag" "$asset" --yes');
    expect(source).toContain('gh release upload "$tag" --clobber');
    expect(source).not.toContain('gh release delete "$tag"');
    expect(source).not.toContain('releases/github/${tag}.md');
  });
});
