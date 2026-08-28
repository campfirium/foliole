import path from 'node:path';

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePath(value) {
  return normalize(value).replaceAll('/', '\\');
}

export function isTrustedNativeClientWrapper(processEntry, paths) {
  const commandLine = normalize(processEntry?.CommandLine);
  const nativeScript = normalizePath(path.join(paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs'));
  const expectedSuffix = `/d /c ""${normalizePath(paths.systemNode)}" "${nativeScript}""`;
  return normalize(processEntry?.Name) === 'cmd.exe' && commandLine.endsWith(expectedSuffix);
}

export function allowsSyncGroupNativeClient(action, residual, paths) {
  return ['multi-device-sync-a-leave', 'multi-device-sync-a-rejoin', 'multi-device-sync-c',
    'multi-device-sync-from-zero', 'multi-device-sync-participation',
    'desktop-dnssd-route-prepare', 'desktop-dnssd-route-provider',
    'desktop-dnssd-route-selfcheck',
    'frozen-revision-preflight', 'sync-group-baseline-reset',
    'sync-group-recover', 'sync-group-task3', 'sync-group-task3-protect'].includes(action)
    && residual.length === 1
    && isTrustedNativeClientWrapper(residual[0], paths);
}
