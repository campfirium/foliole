import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runManagedCommand } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const TARGET_GATE_TIMEOUT_MS = 90_000;

export function runTargetGate(cwd, target, env = {}) {
  return runManagedCommand('bash', [TARGET_SCRIPT, target], {
    cwd,
    env: {
      GITHUB_ACTIONS: 'true',
      QUALITY_GATE_LOG_MODE: 'summary',
      RUNNER_ENVIRONMENT: 'github-hosted',
      ...env
    },
    label: `quality-gate-target ${target}`,
    timeoutMs: TARGET_GATE_TIMEOUT_MS
  });
}

export async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-release-target-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

export function releaseScripts() {
  const ok = (message) => `printf '%s\\n' '${message}'`;
  return {
    'check:android-boundary': ok('android boundary ok'),
    'lint:desktop:full': ok('desktop lint ok'),
    'lint:android:full': ok('Android lint ok'),
    'lint:shared:full': ok('shared lint ok'),
    'lint:full': ok('release lint ok'),
    'typecheck:desktop': ok('release desktop typecheck ok'),
    'typecheck:android': ok('release android typecheck ok'),
    'typecheck:shared': ok('shared typecheck ok'),
    'test:release:desktop-src': ok('release desktop src test ok'),
    'test:desktop:electron': ok('release desktop electron test ok'),
    'test:windows:core': ok('release windows core test ok'),
    'test:windows:native-preview': ok('release windows preview recovery test ok'),
    'test:release:android': ok('release android test ok'),
    'test:release:shared': ok('release shared test ok'),
    'test:quality:core': ok('release quality core test ok'),
    'test:quality:gate': ok('release quality gate test ok'),
    'test:quality:gate-integration': ok('release quality gate integration test ok'),
    'test:quality:gate-integration:routing': ok('release quality gate integration routing test ok'),
    'test:quality:gate-integration:fast-delegation': ok('release quality gate integration fast delegation test ok'),
    'test:quality:gate-integration:targets': ok('release quality gate integration targets test ok'),
    'test:quality:gate-integration:target-core': ok('release quality gate integration target core test ok'),
    'test:quality:gate-integration:target-failures': ok('release quality gate integration target failures test ok'),
    'test:quality:gate-integration:target-collect': ok('release quality gate integration target collect test ok'),
    'test:quality:gate-integration:target-telemetry': ok('release quality gate integration target telemetry test ok'),
    'test:quality:gate-integration:release-targets': ok('release quality gate integration release targets test ok'),
    'test:quality:gate-integration:release-tail': ok('release quality gate integration release tail test ok'),
    'test:quality:node': ok('release quality node test ok'),
    'test:quality:preview': ok('release quality preview test ok'),
    'build:vite-only': ok('release vite build ok'),
    'electron:compile': ok('release electron compile ok'),
    'android:web:build': ok('release android web build ok'),
    'android:sync': ok('release android sync ok'),
    'android:host:lint': ok('release android host lint ok'),
    'android:host:test': ok('release android host test ok')
  };
}
