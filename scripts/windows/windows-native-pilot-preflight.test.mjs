// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { isForbiddenWorkdir, isWslBashPath, resolvePilotPreflight } from './windows-native-pilot-preflight.mjs';

describe('windows-native-pilot-preflight', () => {
  it('defaults to the dedicated D drive pilot workspace', () => {
    const result = resolvePilotPreflight({});

    expect(result.ok).toBe(true);
    expect(result.config.workdir).toBe('D:\\C\\foliole');
    expect(result.config.homeDir).toBe('D:\\C\\foliole\\.home');
    expect(result.warnings).toContain(
      'Git Bash path was not provided; Windows npm scripts that call bash must verify it before migration.'
    );
  });

  it('rejects protected roots and whitespace pilot paths', () => {
    const result = resolvePilotPreflight({
      FOLIOLE_WINDOWS_NATIVE_WORKDIR: 'D:\\X\\U\\Foliole Data',
      FOLIOLE_WINDOWS_GIT_BASH: 'C:\\Program Files\\Git\\bin\\bash.exe'
    });

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
