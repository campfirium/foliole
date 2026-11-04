// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it.each(['t7-hosted-quality.yml', 'hosted-quality-android-host.yml'])(
  '%s installs the required NDK when SDK command-line tools are outside PATH', file => {
    const artifacts = path.resolve('.tmp/artifacts/security-sdk-toolchain-tests');
    mkdirSync(artifacts, { recursive: true });
    const root = mkdtempSync(path.join(artifacts, 'sdk-'));
    roots.push(root);
    const sdk = path.join(root, 'Android SDK');
    const manager = path.join(sdk, 'cmdline-tools/latest/bin/sdkmanager');
    const receipt = path.join(root, 'installed-package');
    mkdirSync(path.dirname(manager), { recursive: true });
    writeFileSync(manager, '#!/bin/sh\nprintf "%s\\n" "$@" > "$SDK_TEST_RECEIPT"\n');
    chmodSync(manager, 0o755);
    const workflow = parse(readFileSync(`.github/workflows/${file}`, 'utf8'));
    const step = Object.values(workflow.jobs).flatMap(job => job.steps ?? [])
      .find(candidate => candidate.name === 'Install the SQLCipher native toolchain');
    const env = { PATH: '/usr/bin:/bin', ANDROID_HOME: sdk, SDK_TEST_RECEIPT: receipt };
    execFileSync('/bin/bash', ['-e', '-c', step.run], { cwd: root, env, stdio: 'pipe' });
    expect(readFileSync(receipt, 'utf8').trim()).toBe('ndk;25.2.9519653');
    rmSync(manager);
    expect(() => execFileSync('/bin/bash', ['-e', '-c', step.run], { cwd: root, env, stdio: 'pipe' })).toThrow();
  }
);
