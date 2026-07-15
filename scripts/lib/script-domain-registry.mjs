import path from 'node:path';

import { RETIRED_SCRIPT_ASSETS } from './script-domain-retirements.mjs';

export const EXECUTION_PLACEMENTS = [
  'shared-core',
  'macos-only',
  'windows-ci',
  'windows-device',
  'windows-only'
];
export const LIFECYCLE_DISPOSITIONS = ['active', 'confirm', 'obsolete'];

const CONFIRM_ASSETS = new Map([
  ['scripts/oneoff/backfill-node-opening-text.ts', 'one-off database writer; invocation ownership requires confirmation'],
  ['scripts/oneoff/backfill-source-disposition-states.ts', 'one-off database writer; invocation ownership requires confirmation'],
  ['scripts/oneoff/migrate-workspace-data.mjs', 'one-off migration runner; invocation ownership requires confirmation'],
  ['scripts/oneoff/node-kind-report.ts', 'one-off report runner; invocation ownership requires confirmation'],
  ['scripts/oneoff/repair-imported-anchor-locators.mjs', 'one-off repair runner; invocation ownership requires confirmation'],
  ['scripts/oneoff/repair-imported-anchor-locators.ts', 'one-off repair source; invocation ownership requires confirmation']
]);

const WINDOWS_CI_PATTERN =
  /^scripts\/windows\/(?:installed-app-smoke|package-built-artifacts|package-windows|windows-ci-[^.]+)\./u;
const WINDOWS_CI_ONLY_PATTERN = /^scripts\/windows\/windows-ci-/u;
const WINDOWS_VALIDATION_KIT_PATTERN = /^scripts\/windows\/windows-(?:native-mouse-click|validation-)/u;
const WINDOWS_DEVICE_PATTERN =
  /^scripts\/windows\/(?:hidden-native|visible-native|windows-android-dev-server|windows-client-native|windows-preview-native)/u;
const WINDOWS_ASSET_PATTERN = /^(?:scripts\/windows\/|scripts\/android\/windows-|scripts\/android\/open-foliole-android-)/u;
const MACOS_ASSET_PATTERN = /^scripts\/macos\//u;

export const CAPABILITY_CONTRACTS = [
  ...[
    ['lint', []],
    ['lint:desktop', ['--scope', 'desktop']],
    ['lint:android', ['--scope', 'android']],
    ['lint:shared', ['--scope', 'shared']]
  ].map(([name, args]) => ({
    adapter: { args: ['scripts/lint-changed.mjs', ...args], bin: 'node' },
    adapterPath: 'scripts/lint-changed.mjs',
    name,
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  })),
  {
    adapter: { args: ['scripts/quality/run-quality-fast.mjs'], bin: 'node' },
    adapterPath: 'scripts/quality/run-quality-fast.mjs',
    name: 'quality:fast',
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  },
  {
    adapter: { args: ['scripts/quality/run-quality-fast.mjs'], bin: 'node' },
    adapterPath: 'scripts/quality/run-quality-fast.mjs',
    name: 'quality:fast:native',
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  },
  {
    adapter: { args: ['scripts/android/android-web-dev.mjs'], bin: 'node' },
    adapterPath: 'scripts/android/android-web-dev.mjs',
    name: 'android:web:dev',
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  },
  {
    adapter: { args: ['scripts/check-script-domain-contract.mjs'], bin: 'node' },
    adapterPath: 'scripts/check-script-domain-contract.mjs',
    name: 'scripts:domains:check',
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  },
  ...[
    ['electron:dev', 'scripts/run-electron-dev.mjs'],
    ['electron:native:health', 'scripts/run-electron-native-health.mjs'],
    ['test:e2e:desktop:native:hidden', 'scripts/desktop/playwright-desktop-native-hidden.mjs'],
    ['test:e2e:desktop:native:visible', 'scripts/desktop/playwright-desktop-native-visible.mjs']
  ].map(([name, adapterPath]) => ({
    adapter: { args: [adapterPath], bin: 'node' },
    adapterPath,
    name,
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  })),
  ...[
    ['macos:dev:full-restart', ['full-restart']],
    ['macos:dev:logs', ['logs']],
    ['macos:dev:reset', ['reset']],
    ['macos:dev:restart', ['restart']],
    ['macos:dev:status', ['status']],
    ['macos:dev:stop', ['stop']],
    ['macos:preview:reset', ['reset-preview']]
  ].map(([name, args]) => ({
    adapter: { args: ['scripts/macos/macos-electron-dev.mjs', ...args], bin: 'node' },
    adapterPath: 'scripts/macos/macos-electron-dev.mjs',
    name,
    placements: ['macos-only'],
    platforms: ['darwin']
  })),
  ...[
    ['android:open', ['open']],
    ['android:control', ['control']],
    ['android:sync', ['sync']],
    ['android:host:lint', ['gradle', 'lint']],
    ['android:host:test', ['gradle', 'testDebugUnitTest']],
    ['android:host:device-test', ['gradle', 'connectedDebugAndroidTest']],
    ['android:host:device-test:class', ['gradle', 'connectedDebugAndroidTest', '--class']],
    ['android:emulator', ['emulator']],
    ['android:logcat', ['logcat']],
    ['android:preview:lite', ['preview-lite']],
    ['android:screenshot', ['screenshot']]
  ].map(([name, args]) => ({
    adapter: { args: ['scripts/android/android-host.mjs', ...args], bin: 'node' },
    adapterPath: 'scripts/android/android-host.mjs',
    name,
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  })),
  {
    adapter: { args: ['scripts/preview/preview-dedupe.mjs', 'android', '--', 'node', 'scripts/android/android-host.mjs', 'preview'], bin: 'node' },
    adapterPath: 'scripts/android/android-host.mjs',
    name: 'android:preview',
    placements: ['shared-core'],
    platforms: ['darwin', 'linux', 'win32']
  },
  {
    adapter: { args: ['scripts/windows/windows-preview-native-entry.mjs'], bin: 'node' },
    adapterPath: 'scripts/windows/windows-preview-native-entry.mjs',
    name: 'windows:preview:native',
    placements: ['windows-device', 'windows-only'],
    platforms: ['win32']
  },
  {
    adapter: { args: ['scripts/windows/windows-android-dev-server.mjs'], bin: 'node' },
    adapterPath: 'scripts/windows/windows-android-dev-server.mjs',
    name: 'windows:android:dev-server',
    placements: ['windows-device', 'windows-only'],
    platforms: ['win32']
  },
  {
    adapter: { args: ['scripts/windows/package-windows.mjs'], bin: 'node' },
    adapterPath: 'scripts/windows/package-windows.mjs',
    name: 'release:windows:package',
    placements: ['windows-ci', 'windows-only'],
    platforms: ['win32']
  }
];

export const SCRIPT_ASSET_INVENTORY_SHA256 = '28e6ffee2f53e061ad52f8007f2b95bf3e0155ea06ff5b9d2fc757d1bab7e892';

function normalizeScriptPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
}

function classifyExecutionPlacements(filePath) {
  const placements = new Set();
  if (MACOS_ASSET_PATTERN.test(filePath)) {
    placements.add('macos-only');
  }
  if (
    !WINDOWS_CI_ONLY_PATTERN.test(filePath) &&
    (WINDOWS_ASSET_PATTERN.test(filePath) || ['.cmd', '.ps1', '.vbs'].includes(path.extname(filePath)))
  ) {
    placements.add('windows-only');
  }
  if (WINDOWS_CI_PATTERN.test(filePath)) {
    placements.add('windows-ci');
  }
  if (WINDOWS_VALIDATION_KIT_PATTERN.test(filePath)) {
    placements.add('windows-ci');
    placements.add('windows-device');
  }
  if (WINDOWS_DEVICE_PATTERN.test(filePath) || /^scripts\/android\/(?:windows-|open-foliole-android-)/u.test(filePath)) {
    placements.add('windows-device');
  }
  if (placements.size === 0) {
    placements.add('shared-core');
  }
  return [...placements].sort();
}

export function classifyScriptAsset(filePath) {
  const normalized = normalizeScriptPath(filePath);
  if (!normalized.startsWith('scripts/')) {
    return null;
  }
  const confirmReason = CONFIRM_ASSETS.get(normalized) ?? null;
  return {
    confirmReason,
    disposition: RETIRED_SCRIPT_ASSETS.includes(normalized) ? 'obsolete' : confirmReason ? 'confirm' : 'active',
    path: normalized,
    placements: classifyExecutionPlacements(normalized)
  };
}

export function resolveCapabilityContract(name) {
  return CAPABILITY_CONTRACTS.find((contract) => contract.name === name) ?? null;
}

export function resolveCapabilityAdapter(name, platform) {
  const contract = resolveCapabilityContract(name);
  if (!contract) {
    return { ok: false, reason: 'unknown-capability' };
  }
  if (!contract.platforms.includes(platform)) {
    return { ok: false, reason: 'unsupported-platform' };
  }
  return { adapter: contract.adapter, ok: true, placements: contract.placements };
}

export function renderCapabilityCommand(contract) {
  return [contract.adapter.bin, ...contract.adapter.args].join(' ');
}
