// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

const workflows = {
  'android-standalone-apk.yml': 'apk',
  'release-android.yml': 'play',
  'hosted-quality-android-host.yml': 'android-host',
  't7-hosted-quality.yml': null
};
const pins = JSON.parse(readFileSync('scripts/build/mobile-sqlcipher-pins.json', 'utf8'));
const cacheName = 'Restore the content-addressed SQLCipher Android build';

function sqlcipherSteps(file, jobName) {
  const { jobs } = parse(readFileSync(`.github/workflows/${file}`, 'utf8'));
  const job = jobName ? jobs[jobName] : Object.values(jobs).find(candidate =>
    candidate.steps?.some(step => step.name === cacheName));
  const steps = job.steps;
  const ndk = steps.findIndex(step => step.run?.includes(`ndk;${pins.ndk}`));
  return { ndk, cache: steps.findIndex(step => step.name === cacheName), step: steps.find(step => step.name === cacheName) };
}

it.each(Object.entries(workflows))('%s restores SQLCipher right after installing the pinned NDK', (file, job) => {
  const { ndk, cache, step } = sqlcipherSteps(file, job);
  expect(ndk).toBeGreaterThanOrEqual(0);
  expect(cache).toBe(ndk + 1);
  expect(step.uses).toBe('actions/cache@v4');
  expect(step.with.key).toContain(`-ndk-${pins.ndk}-`);
});

it('uses one cache definition everywhere so lanes share and invalidate the same build', () => {
  const definitions = Object.entries(workflows).map(([file, job]) => sqlcipherSteps(file, job).step.with);
  for (const definition of definitions) expect(definition).toEqual(definitions[0]);
});

it('hashes every input the build script uses for its own content fingerprint', () => {
  const { key } = sqlcipherSteps('release-android.yml', 'play').step.with;
  expect(key).toContain("hashFiles('scripts/build/mobile-sqlcipher*', 'lib/native/folderBackup/**')");
  const source = readFileSync('scripts/build/mobile-sqlcipher.mjs', 'utf8');
  expect(source).toContain("path.join(root, 'lib/native/folderBackup')");
  expect(source).toContain("['sources', 'apple', 'android', 'rsync'].map(name =>");
  expect(source).toContain("new URL('./mobile-sqlcipher-pins.json', import.meta.url)");
  expect(source).toMatch(/const key = sha256\(Buffer\.concat\(\[Buffer\.from\(JSON\.stringify\(pins\)\), \.\.\.inputs\]\)\)/u);
});
