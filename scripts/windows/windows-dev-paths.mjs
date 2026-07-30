/* global process */

import path from 'node:path';

export const WINDOWS_DEV_REPO_ROOT = 'C:\\dev\\foliole-android-lab-preview';
export const WINDOWS_DEV_SYSTEM_NODE = 'C:\\Program Files\\nodejs\\node.exe';
export const WINDOWS_DEV_SYSTEM_NPM_CLI = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function windowsDevPaths({
  localAppData = process.env.LOCALAPPDATA,
  repoRoot = WINDOWS_DEV_REPO_ROOT,
  userProfile = process.env.USERPROFILE
} = {}) {
  const appData = required(localAppData, 'LOCALAPPDATA');
  const profile = required(userProfile, 'USERPROFILE');
  const gitRoot = path.win32.join(appData, 'Foliole', 'windows-dev-git');
  const oldLabRoot = path.win32.join(appData, 'Foliole', 'windows-android-lab');
  return {
    adbPath: path.win32.join(appData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    androidSdk: path.win32.join(appData, 'Android', 'Sdk'),
    authorizedKeys: 'C:\\ProgramData\\ssh\\administrators_authorized_keys',
    bareRepository: path.win32.join(gitRoot, 'repository.git'),
    buildLock: path.win32.join(appData, 'Foliole', 'windows-dev-control', 'build.lock'),
    gitPath: path.win32.join(profile, 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
    gitRoot,
    javaHome: path.win32.join(appData, 'Programs', 'Android Studio', 'jbr'),
    oldBareRepository: path.win32.join(oldLabRoot, 'repository.git'),
    oldConfig: path.win32.join(oldLabRoot, 'config.json'),
    oldLabRoot,
    protectionBackups: path.win32.join(oldLabRoot, 'protection', 'backups'),
    receiver: path.win32.join(gitRoot, 'receive.mjs'),
    repoRoot,
    signingHome: path.win32.join(oldLabRoot, 'signing', 'android-user-home'),
    signingKeystore: path.win32.join(oldLabRoot, 'signing', 'android-user-home', 'debug.keystore'),
    signingManifest: path.win32.join(oldLabRoot, 'signing', 'identity.json'),
    systemNode: WINDOWS_DEV_SYSTEM_NODE,
    systemNpmCli: WINDOWS_DEV_SYSTEM_NPM_CLI
  };
}
