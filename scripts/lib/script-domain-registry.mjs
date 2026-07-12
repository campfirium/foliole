import path from 'node:path';

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

const WINDOWS_CI_PATTERN = /^scripts\/windows\/(?:installed-app-smoke|package-built-artifacts|package-windows)\./u;
const WINDOWS_DEVICE_PATTERN =
  /^scripts\/windows\/(?:hidden-native|playwright-desktop-native|visible-native|windows-client-native|windows-preview-native)/u;
const WINDOWS_ASSET_PATTERN = /^(?:scripts\/windows\/|scripts\/android\/windows-|scripts\/android\/open-foliole-android-)/u;

export const CAPABILITY_CONTRACTS = [
  {
    adapter: { args: ['scripts/check-script-domain-contract.mjs'], bin: 'node' },
    adapterPath: 'scripts/check-script-domain-contract.mjs',
    name: 'scripts:domains:check',
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
    adapter: { args: ['scripts/windows/package-windows.mjs', '--native'], bin: 'node' },
    adapterPath: 'scripts/windows/package-windows.mjs',
    name: 'release:windows:package',
    placements: ['windows-ci', 'windows-only'],
    platforms: ['win32']
  }
];

export const SCRIPT_ASSET_INVENTORY_SHA256 = 'f88dac2bea7b0084deb7197a95dfa38568b056827e08e83cb34a65660aa75ddf';

function normalizeScriptPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//u, '').trim();
}

function classifyExecutionPlacements(filePath) {
  const placements = new Set();
  if (WINDOWS_ASSET_PATTERN.test(filePath) || ['.cmd', '.ps1', '.vbs'].includes(path.extname(filePath))) {
    placements.add('windows-only');
  }
  if (WINDOWS_CI_PATTERN.test(filePath)) {
    placements.add('windows-ci');
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
    disposition: confirmReason ? 'confirm' : 'active',
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
