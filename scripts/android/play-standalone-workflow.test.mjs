// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/android-standalone-apk.yml', 'utf8'));
const steps = workflow.jobs.apk.steps;
const index = name => steps.findIndex(step => step.name === name);
const building = "inputs.resume_run_id == ''";
const resuming = "inputs.resume_run_id != ''";
const signedName = 'foliole-android-standalone-signed-${{ inputs.version_code }}-${{ inputs.target_sha }}';

it('keeps the upload-signed AAB with its receipt before any Play call', () => {
  const keep = steps[index('Keep the signed AAB before any Play call')];
  expect(index('Keep the signed AAB before any Play call')).toBe(index('Sign with the existing Play upload certificate') + 1);
  expect(index('Keep the signed AAB before any Play call'))
    .toBeLessThan(index('Let Play sign the universal APK from an internal-track draft'));
  expect(keep.if).toBe(building);
  expect(keep.with.name).toBe(signedName);
  expect(keep.with.path).toContain('app-release-signed.aab');
  expect(keep.with.path).toContain('bundle.json');
  expect(keep.with['if-no-files-found']).toBe('error');
});

it('resubmits an earlier run only for the same target and version code without rebuilding or re-signing', () => {
  expect(workflow.on.workflow_dispatch.inputs.resume_run_id).toMatchObject({ required: false, default: '' });
  expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' });
  for (const name of ['Install dependencies', 'Build the production AAB without credentials',
    'Sign with the existing Play upload certificate']) expect(steps[index(name)].if).toBe(building);
  const restore = steps[index('Restore the signed AAB of the earlier run')];
  expect(restore).toMatchObject({ if: resuming, uses: 'actions/download-artifact@v5' });
  expect(restore.with).toMatchObject({ name: signedName, path: '.tmp/artifacts/android-standalone-apk',
    'run-id': '${{ inputs.resume_run_id }}' });
  const deliver = steps[index('Let Play sign the universal APK from an internal-track draft')];
  expect(deliver.if).toBeUndefined();
  expect(index('Restore the signed AAB of the earlier run')).toBeLessThan(steps.indexOf(deliver));
  expect(steps.filter(step => step.if === resuming).every(step => !JSON.stringify(step).includes('UPLOAD_KEYSTORE'))).toBe(true);
});

it('binds a resumed AAB to its signing receipt before talking to Play', () => {
  const source = readFileSync('scripts/android/play-standalone-apk.mjs', 'utf8');
  const digestCheck = source.indexOf("!== bundleInfo.uploadBundle?.digest) throw new Error('Signed bundle digest differs')");
  expect(digestCheck).toBeGreaterThan(0);
  expect(digestCheck).toBeLessThan(source.indexOf('playAccessToken('));
});
