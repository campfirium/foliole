/* global process */

import { accessSync, constants, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function executable(filePath) {
  if (!filePath) return null;
  try {
    accessSync(filePath, constants.X_OK);
    return filePath;
  } catch {
    return null;
  }
}

function pathCandidates(name, envPath) {
  return String(envPath ?? '').split(path.delimiter).filter(Boolean).map((entry) => path.join(entry, name));
}

export function resolveExecutable(name, candidates = [], envPath = process.env.PATH) {
  for (const candidate of [...candidates, ...pathCandidates(name, envPath)]) {
    const resolved = executable(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function androidSdkCandidates(env = process.env, home = os.homedir()) {
  return [...new Set([
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'),
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools'
  ].filter(Boolean))];
}

export function resolveAndroidTool(name, options = {}) {
  const env = options.env ?? process.env;
  const home = options.home ?? os.homedir();
  const subdir = name === 'emulator' ? 'emulator' : 'platform-tools';
  const explicit = name === 'adb' ? env.ADB_PATH : env.ANDROID_EMULATOR_PATH;
  const candidates = [explicit, ...androidSdkCandidates(env, home).map((root) => path.join(root, subdir, name))];
  return resolveExecutable(name, candidates, env.PATH);
}

export function resolveScrcpy(options = {}) {
  const env = options.env ?? process.env;
  return resolveExecutable('scrcpy', [env.SCRCPY_PATH], env.PATH);
}

export function resolveJavaHome(env = process.env) {
  const candidates = [
    env.JAVA_HOME,
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  ].filter(Boolean);
  return candidates.find((home) => executable(path.join(home, 'bin', 'java'))) ?? null;
}

export function withJavaHome(env = process.env) {
  const javaHome = resolveJavaHome(env);
  return javaHome ? { ...env, JAVA_HOME: javaHome, PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${env.PATH ?? ''}` } : env;
}

export function withAndroidSdk(env = process.env) {
  const sdkRoot = androidSdkCandidates(env).find((candidate) => existsSync(path.join(candidate, 'platforms')));
  return sdkRoot ? { ...env, ANDROID_HOME: sdkRoot } : env;
}

export function requireTool(toolPath, message) {
  if (toolPath) return toolPath;
  throw new Error(message);
}
