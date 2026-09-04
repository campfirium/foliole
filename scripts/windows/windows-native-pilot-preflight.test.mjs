// @vitest-environment node

import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { findGitBashPath, isForbiddenWorkdir, isWslBashPath, resolvePilotPreflight } from './windows-native-pilot-preflight.mjs';

describe('windows-native-pilot-preflight', () => {
  it('defaults to the dedicated D drive pilot workspace', () => {
    const result = resolvePilotPreflight({}, { gitBashCandidates: [] });
    const expectedWorkdir = process.platform === 'win32' ? process.cwd() : 'D:\\C\\foliole';

    expect(result.ok).toBe(true);
    expect(result.config.workdir).toBe(expectedWorkdir);
    expect(result.config.homeDir).toBe(`${expectedWorkdir}\\.tmp\\home`);
    expect(result.config.npmCacheDir).toBe(`${expectedWorkdir}\\.tmp\\npm-cache`);
    expect(result.config.readyFile).toBe(`${expectedWorkdir}\\.windows-native-boot-ready.json`);
    expect(result.config.bridgeReadyFile).toBe(`${expectedWorkdir}\\.windows-native-bridge-ready.json`);
    expect(result.config.logDir).toBe(`${expectedWorkdir}\\.tmp\\windows-native-client`);
    expect(result.warnings).toContain(
      'Git Bash path was not provided; native Windows client scripts do not require bash, but legacy bash-backed npm scripts must configure FOLIOLE_WINDOWS_GIT_BASH before use.'
    );
  });

  it('auto-detects Git Bash from known candidates when no script shell is configured', () => {
    const result = resolvePilotPreflight({}, { gitBashCandidates: ['C:\\missing\\bash.exe', process.execPath] });

    expect(findGitBashPath(['C:\\missing\\bash.exe', process.execPath])).toBe(process.execPath);
    expect(result.config.gitBashPath).toBe(process.execPath);
    expect(result.warnings).toContain(`Git Bash path was auto-detected for legacy bash-backed scripts; set FOLIOLE_WINDOWS_GIT_BASH if this changes: ${process.execPath}`);
  });

  it('rejects protected roots and whitespace pilot paths', () => {
    const options = {};
    Object.defineProperty(options, 'gitBashCandidates', {
      get() {
        throw new Error('configured Git Bash must bypass discovery');
      }
    });
    const result = resolvePilotPreflight({
      FOLIOLE_WINDOWS_NATIVE_WORKDIR: 'D:\\X\\U\\Foliole Data',
      FOLIOLE_WINDOWS_GIT_BASH: 'C:\\Program Files\\Git\\bin\\bash.exe'
    }, options);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('workdir must not contain whitespace for the first pilot: D:\\X\\U\\Foliole Data');
    expect(result.errors).toContain('workdir must not be under a protected user/data root: D:\\X\\U\\Foliole Data');
  });

  it('detects WSL bash when Windows scripts need Git Bash', () => {
    const result = resolvePilotPreflight({
      FOLIOLE_WINDOWS_GIT_BASH: 'C:\\Windows\\System32\\bash.exe'
    });

    expect(isWslBashPath('C:/Windows/System32/bash.exe')).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('bash path resolves to WSL bash; use Git Bash explicitly: C:\\Windows\\System32\\bash.exe');
  });

  it('allows the dedicated pilot root and blocks user/data roots', () => {
    expect(isForbiddenWorkdir('D:\\C\\foliole')).toBe(false);
    expect(isForbiddenWorkdir('C:\\Users\\zephu\\Documents\\foliole')).toBe(true);
    expect(isForbiddenWorkdir('D:\\X\\U\\Foliole\\Data')).toBe(true);
  });
});
