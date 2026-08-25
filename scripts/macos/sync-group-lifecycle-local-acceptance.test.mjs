import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

it('runs the lifecycle scenario locally without spoofing the hosted quality boundary', async () => {
  const source = await readFile('scripts/macos/sync-group-lifecycle-local-acceptance.mjs', 'utf8');
  expect(source).toContain('runIosSyncGroupLifecycleAcceptance(REPO_ROOT, ARTIFACT_DIR)');
  expect(source).toContain("withIosAcceptanceArtifacts(REPO_ROOT, async () => {");
  expect(source).toContain("'.tmp/artifacts/sync-group-lifecycle/t151-3-accepted'");
  expect(source).not.toMatch(/GITHUB_ACTIONS|RUNNER_ENVIRONMENT/u);
});
