// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/dev-push-health.yml', 'utf8');

describe('dev push health workflow contract', () => {
  it('runs on dev pushes and manual dispatch with read-only repository access', () => {
    expect(workflow).toContain('name: Dev Push Health');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- dev');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('group: dev-push-health-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
  });

  it('runs the Linux-safe blocking subset on Ubuntu with a bounded timeout', () => {
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain('timeout-minutes: 120');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('Linux-safe remote blocking subset');

    for (const command of [
      'npm run lint:full',
      'npm run typecheck:desktop',
      'npm run typecheck:android',
      'npm run test:release:desktop-src',
      'npm run test:release:android',
      'npm run test:release:shared',
      'npm run test:quality:core',
      'npm run test:quality:gate',
      'npm run test:quality:node',
      'npm run test:quality:preview',
      'npm run build:vite-only',
      'npm run electron:compile',
      'npm run android:web:build'
    ]) {
      expect(workflow).toContain(command);
    }
  });

  it('prepares Electron sqlite before sqlite-backed buckets run', () => {
    expect(workflow).toContain('npm run electron:rebuild:native');
    expect(workflow).toContain('node scripts/electron-sqlite-runner.mjs --preflight');

    for (const command of [
      'npm run test:release:desktop-src',
      'npm run test:release:android',
      'npm run test:release:shared',
      'npm run test:quality:core',
      'npm run test:quality:gate',
      'npm run test:quality:preview'
    ]) {
      expect(workflow.indexOf('npm run electron:rebuild:native')).toBeLessThan(workflow.indexOf(command));
      expect(workflow.indexOf('node scripts/electron-sqlite-runner.mjs --preflight')).toBeLessThan(
        workflow.indexOf(command)
      );
    }
  });

  it('does not pull native tails, E2E, publishing, or advisory failure behavior into dev push health', () => {
    for (const rejected of [
      'continue-on-error',
      'android:sync',
      'android:host:',
      'android:emulator',
      'test:windows:',
      'test:e2e:',
      'gh release',
      'actions/upload-artifact',
      'actions/attest',
      'softprops/action-gh-release',
      'ncipollo/release-action',
      'contents: write'
    ]) {
      expect(workflow).not.toContain(rejected);
    }
  });
});
