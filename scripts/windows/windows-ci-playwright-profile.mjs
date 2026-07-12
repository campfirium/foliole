import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { runNativeHiddenDesktopGate } from '../desktop/playwright-desktop-native-hidden.mjs';

export const WINDOWS_CI_PLAYWRIGHT_SPECS = [
  'tests/desktop/hidden-native-presentation.spec.ts',
  'tests/desktop/agent-control-visible-write.spec.ts'
];

export const WINDOWS_PHYSICAL_ONLY_SPECS = [
  'tests/desktop/global-capture-panel.spec.ts',
  'tests/desktop/global-capture-toast-navigation.spec.ts',
  'tests/desktop/visible-native-presentation.spec.ts'
];

export const WINDOWS_PHYSICAL_ONLY_CAPABILITIES = [
  'native-dialog',
  'tray-and-notification',
  'uac',
  'dpi-and-multiple-displays',
  'installer-and-updater',
  'real-device-focus-and-screen-coordinates'
];

function findDuplicates(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function validateSpecPaths(label, specs, repoRoot, existsSync) {
  const errors = [];
  for (const spec of specs) {
    if (!/^tests\/desktop\/[a-z0-9.-]+\.spec\.ts$/u.test(spec)) {
      errors.push(`${label} has invalid desktop spec path: ${spec}`);
    } else if (!existsSync(path.join(repoRoot, spec))) {
      errors.push(`${label} spec is missing: ${spec}`);
    }
  }
  for (const duplicate of findDuplicates(specs)) {
    errors.push(`${label} contains a duplicate spec: ${duplicate}`);
  }
  return errors;
}

export function validateWindowsCiPlaywrightProfile({
  repoRoot = process.cwd(),
  existsSync = fs.existsSync,
  ciSpecs = WINDOWS_CI_PLAYWRIGHT_SPECS,
  physicalOnlySpecs = WINDOWS_PHYSICAL_ONLY_SPECS
} = {}) {
  const errors = [
    ...validateSpecPaths('ci-suite', ciSpecs, repoRoot, existsSync),
    ...validateSpecPaths('physical-only', physicalOnlySpecs, repoRoot, existsSync)
  ];
  for (const spec of ciSpecs.filter((candidate) => physicalOnlySpecs.includes(candidate))) {
    errors.push(`physical-only spec cannot enter ci-suite: ${spec}`);
  }
  return { errors, ok: errors.length === 0 };
}

export function renderWindowsCiPlaywrightProfile() {
  return [
    ...WINDOWS_CI_PLAYWRIGHT_SPECS.map((spec) => `ci-suite=${spec}`),
    ...WINDOWS_PHYSICAL_ONLY_SPECS.map((spec) => `physical-only=${spec}`),
    ...WINDOWS_PHYSICAL_ONLY_CAPABILITIES.map((capability) => `physical-only-capability=${capability}`)
  ].join('\n');
}

export async function runWindowsCiPlaywright({
  platform = process.platform,
  runGate = runNativeHiddenDesktopGate
} = {}) {
  const validation = validateWindowsCiPlaywrightProfile();
  if (!validation.ok) {
    throw new Error(validation.errors.join('\n'));
  }
  if (platform !== 'win32') {
    throw new Error('Windows CI Playwright execution requires win32; use --list or --validate on other hosts.');
  }
  return runGate({ argv: WINDOWS_CI_PLAYWRIGHT_SPECS });
}

async function runCli(argv) {
  if (argv.includes('--list')) {
    process.stdout.write(`${renderWindowsCiPlaywrightProfile()}\n`);
    return 0;
  }
  if (argv.includes('--validate')) {
    const result = validateWindowsCiPlaywrightProfile();
    if (!result.ok) throw new Error(result.errors.join('\n'));
    process.stdout.write(`[windows-ci-playwright] status: OK specs=${WINDOWS_CI_PLAYWRIGHT_SPECS.length}\n`);
    return 0;
  }
  return runWindowsCiPlaywright();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`[windows-ci-playwright] ${error.message}\n`);
    process.exitCode = 1;
  });
}
