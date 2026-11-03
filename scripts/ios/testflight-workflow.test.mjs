// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/release-ios.yml', 'utf8'));

it('selects a supported Xcode and refuses SDKs below Apple upload requirements', () => {
  const upload = workflow.jobs['signed-upload'];
  expect(Number(upload.env.DEVELOPER_DIR?.match(/Xcode_(\d+)/u)?.[1] ?? 0)).toBeGreaterThanOrEqual(26);
  const step = upload.steps.find(entry => entry.id === 'toolchain');
  mkdirSync('.tmp/artifacts', { recursive: true });
  const directory = mkdtempSync(path.resolve('.tmp/artifacts/testflight-sdk-'));
  try {
    for (const [command, output] of [['xcodebuild', 'Xcode 26.3'], ['xcrun', '$SDK_VERSION']]) {
      const file = path.join(directory, command);
      writeFileSync(file, `#!/bin/sh\necho "${output}"\n`); chmodSync(file, 0o755);
    }
    for (const SDK_VERSION of ['18.5', '25.4', '26.2', '27.2']) {
      const result = spawnSync('bash', ['-e', '-c', step.run], {
        env: { ...process.env, SDK_VERSION, PATH: `${directory}:/usr/bin:/bin` }, encoding: 'utf8'
      });
      expect(result.status === 0).toBe(Number(SDK_VERSION.split('.')[0]) >= 26);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
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
