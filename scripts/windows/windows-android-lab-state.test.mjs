// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  androidLabPaths, assertExclusiveDevice, parseAndroidLabCommand, safeLabEvidencePath, WINDOWS_ANDROID_LAB_TASK
} from './windows-android-lab-state.mjs';

const SHA = 'a'.repeat(40);

describe('Windows Android lab state contract', () => {
  it('keeps the task and state root separate from release acceptance', () => {
    const paths = androidLabPaths('C:\\state\\windows-android-lab');
    expect(WINDOWS_ANDROID_LAB_TASK).toBe('FolioleAndroidLab');
    expect(paths.root).not.toContain('windows-device');
    expect(paths.preview).toBe('C:\\dev\\foliole-android-lab-preview');
  });

  it('accepts only the fixed command and evidence grammar', () => {
    expect(parseAndroidLabCommand(`run ${SHA}`)).toEqual({ action: 'run', commitSha: SHA });
    expect(parseAndroidLabCommand('collect get summary.json').relativePath).toBe('summary.json');
    expect(() => parseAndroidLabCommand('run HEAD')).toThrow();
    expect(() => parseAndroidLabCommand('collect get ../git-read-token.txt')).toThrow();
    expect(() => parseAndroidLabCommand('deploy 1 abc')).toThrow();
    expect(safeLabEvidencePath('/evidence', 'runner.log')).toContain('runner.log');
  });

  it('requires exactly one ready device and the configured serial', () => {
    expect(() => assertExclusiveDevice('List of devices attached\nA5\tdevice\n', 'A5')).not.toThrow();
    expect(() => assertExclusiveDevice('A5\tdevice\nB6\tdevice\n', 'A5')).toThrow('exactly one');
    expect(() => assertExclusiveDevice('A5\tunauthorized\n', 'A5')).toThrow('found none');
  });
});
