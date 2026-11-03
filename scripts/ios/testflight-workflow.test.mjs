// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/release-ios.yml', 'utf8'));
it('reuses the successful upload artifact on a Linux-only retry with a newer run attempt', () => {
  const upload = workflow.jobs['signed-upload'];
  const review = workflow.jobs['external-review'];
  const output = upload.steps.find(step => step.id === 'candidate');
  const resolve = (value, attempt) => value.replaceAll('${{ inputs.target_sha }}', 'source')
    .replaceAll('${{ github.run_attempt }}', String(attempt));
  const successfulUpload = output ? resolve(output.run.match(/artifact_name=([^']+)/u)[1], 1) : '';
  const originalArtifact = resolve(upload.steps.find(step => step.uses?.startsWith('actions/upload-artifact')).with.name, 1);
  const download = review.steps.find(step => step.uses?.startsWith('actions/download-artifact')).with.name;
  const retryDownload = resolve(download, 2)
    .replace('${{ needs.signed-upload.outputs.candidate_artifact }}', successfulUpload);
  expect(retryDownload).toBe(originalArtifact);
});

it('releases macOS after upload and waits for processing only on Linux', () => {
  expect(workflow.jobs['signed-upload']['runs-on']).toBe('macos-15');
  expect(workflow.jobs['external-review']['runs-on']).toBe('ubuntu-latest');
  expect(workflow.jobs['external-review'].needs).toBe('signed-upload');
  const uploadCommands = workflow.jobs['signed-upload'].steps.map(step => step.run ?? '').join('\n');
  expect(uploadCommands).toContain('fastlane ios upload');
  expect(uploadCommands).not.toContain('fastlane ios distribute');
  expect(workflow.on.workflow_dispatch).toBeUndefined();
});
