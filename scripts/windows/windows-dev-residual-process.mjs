import path from 'node:path';

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePath(value) {
  return normalize(value).replaceAll('/', '\\');
}

function isTrustedNativeClientWrapper(processEntry, paths) {
  const commandLine = normalize(processEntry?.CommandLine);
  const nativeScript = normalizePath(path.join(paths.repoRoot, 'scripts', 'windows', 'electron-dev-native.mjs'));
  const expectedSuffix = `/d /c ""${normalizePath(paths.systemNode)}" "${nativeScript}""`;
  return normalize(processEntry?.Name) === 'cmd.exe' && commandLine.endsWith(expectedSuffix);
}

export function allowsPairSyncNativeClient(action, residual, paths) {
  return action === 'pair-sync-recover' && residual.length === 1
    && isTrustedNativeClientWrapper(residual[0], paths);
}
