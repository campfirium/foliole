import {
  ANDROID_DEV_SERVER_INSTALL_PATH_PATTERN,
  ANDROID_DEV_SERVER_RESTART_PATHS,
  ANDROID_DEV_SERVER_WEB_PATHS,
  pathMatchesPrefix
} from '../lib/path-domain-registry.mjs';

function hasPath(files, predicate) {
  return files.some((file) => predicate(file.replaceAll('\\', '/')));
}

function isInstallPath(file) {
  return ANDROID_DEV_SERVER_INSTALL_PATH_PATTERN.test(file);
}

function isRestartPath(file) {
  return pathMatchesPrefix(file, ANDROID_DEV_SERVER_RESTART_PATHS);
}

function isWebPath(file) {
  return pathMatchesPrefix(file, ANDROID_DEV_SERVER_WEB_PATHS);
}

export function selectAndroidDevServerActionWithCommittedFiles({
  changedFiles,
  committedFilesSinceRuntime = [],
  currentHead,
  status
}) {
  if (hasPath(changedFiles, isInstallPath) || hasPath(committedFilesSinceRuntime || [], isInstallPath)) {
    return { action: 'rebuild-install', reason: 'native, config, schema, or dependency path requires APK rebuild' };
  }
  if (status?.installedApkState === 'missing') {
    return { action: 'rebuild-install', reason: 'installed APK marker is missing' };
  }
  if (committedFilesSinceRuntime === null && status?.installedApkHead && status.installedApkHead !== currentHead) {
    return { action: 'rebuild-install', reason: 'installed APK head cannot be compared to current checkout' };
  }
  if (!status?.ready || status.devServerState !== 'current') {
    return { action: 'restart-app', reason: 'dev server is stopped or stale for the current checkout' };
  }
  if (hasPath(changedFiles, isRestartPath) || hasPath(committedFilesSinceRuntime || [], isRestartPath)) {
    return { action: 'restart-app', reason: 'dev-server adapter or launch path changed' };
  }
  if (status.reverseStatus !== 'ok' || status.appLaunchResult !== 'opened') {
    return { action: 'restart-app', reason: 'A5 reverse or app launch state is not current' };
  }
  if (hasPath(changedFiles, isWebPath) || hasPath(committedFilesSinceRuntime || [], isWebPath)) {
    return { action: 'hot-update', reason: 'companion web path is served by Vite HMR' };
  }
  return { action: 'hot-update', reason: 'dev-server runtime is current' };
}
