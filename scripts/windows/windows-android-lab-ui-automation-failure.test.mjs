// @vitest-environment node

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runWindowsAndroidLabUiAutomation } from './windows-android-lab-ui-automation.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-ui-failure-'));
  roots.push(root);
  return {
    env: {
      ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-android-lab-preview',
      FOLIOLE_ANDROID_ADB_PATH: 'adb.exe',
      FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT: root,
      FOLIOLE_ANDROID_SERIAL: '192.168.0.107:38717'
    },
    root
  };
}

function result(stdout = '') {
  return { code: 0, stderr: '', stdout, stdoutBuffer: Buffer.from(stdout) };
}

function successfulExceptInstrumentation(command, args) {
  const joined = args.join(' ');
  if (joined.includes('dumpsys window policy')) return result('mShowingLockscreen=false\n');
  if (joined.includes('dumpsys power')) return result('mWakefulness=Awake\n');
  if (joined.includes('dumpsys window windows')) {
    return result('mResumeActivity:ActivityRecord{abc u0 com.foliole.android/.MainActivity} t312}\n');
  }
  if (joined.includes('am instrument')) {
    return result('INSTRUMENTATION_STATUS: folioleBeforeSemantic={"elements":[]}\n');
  }
  return result('ok\n');
}

describe('Windows Android Lab UI automation failure evidence', () => {
  it('reports incomplete instrumentation evidence without folding it into a generic UI error', async () => {
    const { env, root } = fixture();
    await expect(runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings'], env,
      execute: successfulExceptInstrumentation
    })).rejects.toMatchObject({ code: 'ui_instrumentation_evidence_incomplete' });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'action-receipt.json'), 'utf8'))).toMatchObject({
      errorCode: 'ui_instrumentation_evidence_incomplete',
      instrumentation: { missing: ['after', 'receipt'], present: ['before'] },
      resultStatus: 'failure'
    });
  });

  it('writes progress before a blocked child command can finish', async () => {
    const { env, root } = fixture();
    let output = '';
    await expect(runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings'], env,
      execute: async () => {
        throw Object.assign(new Error('blocked'), { code: 'ui_command_timeout' });
      },
      stdout: { write: (value) => { output += String(value); } }
    })).rejects.toMatchObject({ code: 'ui_command_timeout' });
    expect(output).toContain('begin: gradle assembleDebugAndroidTest');
    expect(output).toContain('fail: gradle assembleDebugAndroidTest');
    const progress = JSON.parse(fs.readFileSync(path.join(root, 'ui-progress.json'), 'utf8'));
    expect(progress.events[0]).toMatchObject({ state: 'begin', label: 'gradle assembleDebugAndroidTest' });
  });
});
