// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/t7-release.yml', 'utf8');
const assemblySource = fs.readFileSync('.github/workflows/release-assembly.yml', 'utf8');
const qualityRecheckSource = fs.readFileSync('.github/workflows/release-quality-recheck.yml', 'utf8');
const workflow = parse(source);
const assembly = parse(assemblySource);
const qualityRecheck = parse(qualityRecheckSource);
const qualityStages = [
  't5-static', 't5-desktop-static', 't5-dependency-hardening', 't5-windows-core',
  't5-shared', 't5-android-source', 't5-desktop-source', 't5-electron', 't5-tooling',
  't6-desktop-build', 't6-android-web-build', 't6-windows-acceptance', 't6-android-host',
  't6-ios-contract', 't6-ios-pairing-content', 't6-ios-state-writeback',
  't6-ios-sync-pack', 't6-ios-foreground'
];

describe('T7 release workflow contract', () => {
  it('owns exact release push and repaired-HEAD stage rechecks', () => {
    expect(workflow.name).toBe('T7 Release');
    const dispatch = workflow.on.workflow_dispatch.inputs;
    expect(dispatch.stage.options).toEqual([
      ...qualityStages, 'release-candidate', 'macos', 'windows', 'linux', 'assembly', 'full'
    ]);
    expect(dispatch.target_sha).toMatchObject({ required: true, type: 'string' });
    expect(dispatch.target_version).toMatchObject({ required: true, type: 'string' });
    expect(workflow.on.push.branches).toEqual(['release']);
    expect(workflow.on.push['paths-ignore']).toEqual([
      'releases/github/**', 'releases/notes/**', 'releases/update-manifest.json'
    ]);
    expect(workflow.concurrency).toEqual({
      group: 'foliole-t7-exclusive',
      'cancel-in-progress': true
    });
    expect(source).toContain('FOLIOLE_RELEASE_REF_NAME: ${{ github.ref_name }}');
    expect(source).toContain('test "$GITHUB_REF" = "refs/heads/release"');
    expect(source).toContain('test "$REQUESTED_SHA" = "$GITHUB_SHA"');
    expect(source).toContain('test "$remote_sha" = "$REQUESTED_SHA"');
    expect(source).toContain('test "$REQUESTED_VERSION" = "$(node -p');
    expect(source).toContain('node scripts/release-target-contract.mjs >> "$GITHUB_OUTPUT"');
    expect(assemblySource).toContain('FOLIOLE_RELEASE_EXPECTED_INTENT_DIGEST');
    expect(`${source}\n${assemblySource}`.match(/FOLIOLE_RELEASE_REQUIRE_PUBLICATION_MODE/gu))
      .toHaveLength(2);
    expect(source).toContain('node scripts/desktop-update-release-policy.mjs');
    expect(fs.existsSync('.github/workflows/publish-release.yml')).toBe(false);
  });

  it('chains full T7 while routing every T5 and T6 bucket independently', () => {
    const jobs = workflow.jobs;
    expect(jobs.quality_bucket_recheck.uses)
      .toBe('./.github/workflows/release-quality-recheck.yml');
    expect(jobs.quality_bucket_recheck.if)
      .toBe("startsWith(inputs.stage, 't5-') || startsWith(inputs.stage, 't6-')");
    expect(Object.keys(qualityRecheck.jobs)).toEqual(qualityStages);
    for (const stage of qualityStages) {
      expect(qualityRecheck.jobs[stage].if).toBe(`inputs.stage == '${stage}'`);
      expect(qualityRecheck.jobs[stage].with.target_sha).toBe('${{ inputs.target_sha }}');
    }
    expect(jobs.t6_quality.uses).toBe('./.github/workflows/t6-hosted-quality.yml');
    expect(jobs.t6_quality.with.execution_lane).toBe('release-t7');
    expect(jobs.release_candidate.needs).toEqual(['release_context', 't6_quality']);
    expect(jobs.release_candidate.with.target_sha).toContain('needs.t6_quality.outputs.accepted_sha');
    expect(jobs.release_candidate.with.target_sha).toContain('needs.release_context.outputs.target_sha');
    expect(jobs.macos_package.needs).toEqual(['release_context', 'release_candidate']);
    expect(jobs.windows_package.needs).toEqual(['release_context', 'release_candidate']);
    expect(jobs.linux_package.needs).toEqual(['release_context', 'release_candidate']);
    for (const job of [jobs.macos_package, jobs.windows_package, jobs.linux_package]) {
      expect(job.with.target_sha).toContain('needs.release_candidate.outputs.accepted_sha');
      expect(job.with.target_sha).toContain('needs.release_context.outputs.target_sha');
    }
    expect(jobs.linux_package.with.attest_artifact).toBe(true);
    expect(jobs.macos_package.with.updater_baseline_version)
      .toBe('${{ needs.release_context.outputs.macos_updater_baseline_version }}');
    expect(jobs.windows_package.with.updater_baseline_version)
      .toBe('${{ needs.release_context.outputs.windows_updater_baseline_version }}');
    expect(jobs.release_context.outputs.release_scope)
      .toBe('${{ steps.identity.outputs.release_scope }}');
    expect(jobs.release_context.outputs.release_intent_digest)
      .toBe('${{ steps.identity.outputs.release_intent_digest }}');
    expect(jobs.release_context.outputs.release_make_latest)
      .toBe('${{ steps.identity.outputs.release_make_latest }}');
    expect(jobs.assemble_draft.needs)
      .toEqual(['release_context', 'macos_package', 'windows_package', 'linux_package']);
    expect(jobs.assemble_draft.uses).toBe('./.github/workflows/release-assembly.yml');
    expect(jobs.assemble_draft.with.target_sha)
      .toBe('${{ needs.release_context.outputs.target_sha }}');
  });

  it('routes each package stage alone and rebuilds every producer for assembly', () => {
    const stageJobs = { linux: workflow.jobs.linux_package, macos: workflow.jobs.macos_package,
      windows: workflow.jobs.windows_package };
    for (const [stage, job] of Object.entries(stageJobs)) {
      expect(job.if).toContain(`inputs.stage == '${stage}'`);
      expect(job.if).toContain("inputs.stage == 'assembly'");
    }
    expect(workflow.jobs.assemble_draft.if).toContain("inputs.stage == 'assembly'");
    expect(workflow.jobs.assemble_draft.if).toContain("needs.linux_package.result == 'success'");
    expect(workflow.jobs.assemble_draft.if).toContain("needs.macos_package.result == 'success'");
    expect(workflow.jobs.assemble_draft.if).toContain("needs.windows_package.result == 'success'");
  });

  it('keeps draft assembly reusable-only and identity-bound to same-run producers', () => {
    expect(assembly.on.workflow_dispatch).toBeUndefined();
    expect(Object.keys(assembly.on.workflow_call.inputs)).toEqual([
      'linux_artifact_name', 'linux_sha', 'macos_artifact_name', 'macos_sha',
      'release_intent_digest', 'target_sha', 'target_version',
      'windows_artifact_name', 'windows_sha'
    ]);
    expect(assembly.jobs.assemble.env.TARGET_SHA).toBe('${{ inputs.target_sha }}');
  });

  it('passes only the declared platform secret sets and grants write only to assembly', () => {
    expect(Object.keys(workflow.jobs.macos_package.secrets)).toHaveLength(7);
    expect(Object.keys(workflow.jobs.windows_package.secrets)).toEqual([
      'AZURE_CLIENT_ID', 'AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID'
    ]);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.macos_package.permissions.contents).toBe('read');
    expect(workflow.jobs.windows_package.permissions.contents).toBe('read');
    expect(workflow.jobs.linux_package.permissions).toEqual({
      'artifact-metadata': 'write', attestations: 'write', contents: 'read', 'id-token': 'write'
    });
    expect(workflow.jobs.assemble_draft.permissions).toEqual({ actions: 'read', contents: 'write' });
    expect(assembly.permissions).toEqual({ actions: 'read', contents: 'write' });
    expect(source.match(/contents: write/gu)).toHaveLength(1);
  });

  it('hard-gates all active producers and stages only the frozen scope', () => {
    expect(assemblySource.match(/uses: actions\/download-artifact@v5/gu)).toHaveLength(3);
    expect(assemblySource).not.toContain('run-id:');
    expect(assemblySource).not.toContain('repository:');
    expect(assemblySource).toContain('test "$MACOS_SHA" = "$TARGET_SHA"');
    expect(assemblySource).toContain('test "$WINDOWS_SHA" = "$TARGET_SHA"');
    expect(assemblySource).toContain('test "$LINUX_SHA" = "$TARGET_SHA"');
    expect(assemblySource).toContain('node scripts/release-assembly-assets.mjs');
    expect(assemblySource).toContain('--output-root=release-assets/upload');
    expect(assemblySource).toContain('node scripts/release-asset-contract.mjs list');
    expect(assemblySource).toContain('node scripts/release-asset-contract.mjs verify');
  });

  it('guards stale runs and reconciles only an unpublished draft', () => {
    expect(assemblySource).toContain('git ls-remote origin refs/heads/release');
    expect(assemblySource).toContain('test "$remote_sha" = "$TARGET_SHA"');
    expect(assemblySource).toContain('Another unpublished release draft must be retired first');
    expect(assemblySource).toContain('test "$draft_state" = "true"');
    expect(assemblySource).toContain('gh release create "$tag" --draft');
    expect(assemblySource).toContain('gh release edit "$tag" --target "$TARGET_SHA"');
    expect(assemblySource).toContain('gh release delete-asset "$tag" "$asset" --yes');
    expect(assemblySource).toContain('gh release upload "$tag" --clobber');
    expect(assemblySource).toContain("--jq '[.assets[].name]'");
    expect(assemblySource).not.toContain('gh release delete "$tag"');
    expect(assemblySource).not.toContain('releases/github/${tag}.md');
  });
});
