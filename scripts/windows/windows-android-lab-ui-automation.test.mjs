// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseUiAutomationArgs, runWindowsAndroidLabUiAutomation
} from './windows-android-lab-ui-automation.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-ui-'));
  roots.push(root);
  return {
    env: {
      ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-android-lab-preview',
      FOLIOLE_ANDROID_ADB_PATH: 'adb.exe', FOLIOLE_ANDROID_BASH_PATH: 'bash.exe',
      FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT: root, FOLIOLE_ANDROID_SERIAL: '192.168.0.107:38717'
    },
    root
  };
}

function result(stdout = '', stdoutBuffer = Buffer.from(stdout)) {
  return { code: 0, stderr: '', stdout, stdoutBuffer };
}

function instrumentationOutput(testId = 'companion-tab-settings', action = 'click') {
  const before = { elements: [{ testId, visible: true }] };
  const after = { elements: [{ ariaCurrent: 'page', testId, visible: true }] };
  const receipt = { action, ok: true, targetTestId: testId };
  return [
    `INSTRUMENTATION_STATUS: folioleBeforeSemantic=${JSON.stringify(before)}`,
    `INSTRUMENTATION_STATUS: folioleAfterSemantic=${JSON.stringify(after)}`,
    `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify(receipt)}`,
    'INSTRUMENTATION_CODE: -1'
  ].join('\n');
}

function successfulExecute(calls) {
  return async (command, args) => {
    calls.push({ args, command });
    const joined = args.join(' ');
    if (joined.includes('dumpsys window policy')) return result('mShowingLockscreen=false\n');
    if (joined.includes('dumpsys power')) return result('mWakefulness=Awake\n');
    if (joined.includes('dumpsys window windows')) {
      return result('mResumeActivity:ActivityRecord{abc u0 com.foliole.android/.MainActivity} t312}\n');
    }
    if (joined.includes('shell wm size')) return result('Physical size: 1080x1920\n');
    if (joined.includes('dumpsys input')) return result('SurfaceOrientation: 0\n');
    if (joined.includes('exec-out screencap')) return result('', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (joined.includes('exec-out cat')) return result('<hierarchy><node package="com.foliole.android" class="android.webkit.WebView" resource-id="com.foliole.android:id/webview" bounds="[0,0][1080,1920]" clickable="false" enabled="true" /></hierarchy>');
    if (joined.includes('am instrument')) {
      const argument = (name) => args[args.findIndex((value, index) => value === name && args[index - 1] === '-e') + 1];
      return result(instrumentationOutput(argument('testId'), argument('action')));
    }
    return result('ok\n');
  };
}

describe('Windows Android Lab semantic UI automation', () => {
  it('requires a bounded stable identity and action contract', () => {
    expect(parseUiAutomationArgs(['--testId', 'companion-tab-settings'])).toMatchObject({
      action: 'click', expectedAttribute: 'aria-current', expectedValue: 'page', timeoutMs: 10_000
    });
    expect(parseUiAutomationArgs([
      '--testId', 'companion-review-grade-1', '--expectedAttribute', '__actionAccepted', '--expectedValue', 'true'
    ])).toMatchObject({ expectedAttribute: '__actionAccepted', expectedValue: 'true' });
    expect(() => parseUiAutomationArgs(['--testId', '../settings'])).toThrow('stable testId');
    expect(() => parseUiAutomationArgs(['--testId', 'settings', '--action', 'swipe'])).toThrow('click or input');
    expect(() => parseUiAutomationArgs(['--testId', 'settings', '--timeoutMs', '999'])).toThrow('outside');
    expect(() => parseUiAutomationArgs(['--testId', 'settings', '--fallback', '10,10'])).toThrow('unsupported');
    expect(() => parseUiAutomationArgs(['--testId', 'settings', '--action', 'input'])).toThrow('bounded value');
  });

  it('builds the test APK, binds the fixed A5, and writes bounded success evidence', async () => {
    const { env, root } = fixture();
    const calls = [];
    const output = await runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings'], env, execute: successfulExecute(calls)
    });
    expect(output).toMatchObject({ resultStatus: 'success', targetTestId: 'companion-tab-settings' });
    expect(calls[0]).toEqual({
      args: ['scripts/android/windows-gradle-check.sh', 'assembleDebugAndroidTest'], command: 'bash.exe'
    });
    expect(calls).toContainEqual({
      args: [
        '-s', '192.168.0.107:38717', 'install', '-r',
        'C:\\dev\\foliole-android-lab-preview\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk'
      ],
      command: 'adb.exe'
    });
    expect(calls).toContainEqual({
      args: [
        '-s', '192.168.0.107:38717', 'install', '-r', '-t',
        'C:\\dev\\foliole-android-lab-preview\\android\\app\\build\\outputs\\apk\\androidTest\\debug\\app-debug-androidTest.apk'
      ],
      command: 'adb.exe'
    });
    expect(calls).toContainEqual({
      args: ['-s', '192.168.0.107:38717', 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'],
      command: 'adb.exe'
    });
    expect(calls.some((call) => call.args.includes('com.foliole.android.FolioleCompanionWebViewAutomationTest#performsBoundedSemanticAction'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'action-receipt.json'), 'utf8'))).toMatchObject({
      adapter: 'instrumentation-evaluateJavascript', targetTestId: 'companion-tab-settings'
    });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'native-ui-summary.json'), 'utf8')).nodes[0])
      .not.toHaveProperty('text');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'native-ui-summary.json'), 'utf8')).device)
      .toEqual({ orientation: '0', physicalSize: '1080x1920' });
    expect(fs.readFileSync(path.join(root, 'before.png'))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(JSON.parse(fs.readFileSync(path.join(root, 'ui-command-audit.json'), 'utf8')).commands.length).toBeGreaterThan(6);
  });

  it('supports semantic input without retaining the entered value in its command audit', async () => {
    const { env, root } = fixture();
    await runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings', '--action', 'input', '--value', 'private probe'],
      env, execute: successfulExecute([])
    });
    const audit = fs.readFileSync(path.join(root, 'ui-command-audit.json'), 'utf8');
    expect(audit).toContain('<redacted>');
    expect(audit).not.toContain('private probe');
  });

  it('passes the action-accepted Review contract through instrumentation', async () => {
    const { env } = fixture();
    const calls = [];
    await runWindowsAndroidLabUiAutomation({
      argv: [
        '--testId', 'companion-review-grade-1', '--expectedAttribute', '__actionAccepted',
        '--expectedValue', 'true'
      ],
      env,
      execute: successfulExecute(calls)
    });
    const instrumentation = calls.find((call) => call.args.includes('am') && call.args.includes('instrument'));
    expect(instrumentation.args).toEqual(expect.arrayContaining([
      'expectedAttribute', '__actionAccepted', 'expectedValue', 'true'
    ]));
  });

  it('fails closed on a locked device and keeps failure screenshot, receipt, and scoped logcat', async () => {
    const { env, root } = fixture();
    const calls = [];
    const execute = async (command, args) => {
      calls.push({ args, command });
      const joined = args.join(' ');
      if (joined.includes('dumpsys window policy')) return result('mShowingLockscreen=true\n');
      if (joined.includes('dumpsys power')) return result('mWakefulness=Awake\n');
      if (joined.includes('exec-out screencap')) return result('', Buffer.from('failure-png'));
      if (joined.includes('pidof')) return result('321\n');
      if (joined.includes('logcat')) return result('foliole scoped failure\n');
      return result('ok\n');
    };
    await expect(runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings'], env, execute
    })).rejects.toMatchObject({ code: 'device_locked' });
    expect(fs.readFileSync(path.join(root, 'on-failure.png'), 'utf8')).toBe('failure-png');
    expect(fs.readFileSync(path.join(root, 'logcat.txt'), 'utf8')).toContain('scoped failure');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'action-receipt.json'), 'utf8'))).toMatchObject({
      errorCode: 'device_locked', resultStatus: 'failure'
    });
    expect(calls.find((call) => call.args.includes('logcat')).args).toContain('--pid=321');
  });

  it('treats a foreground system surface as a wrong page and captures failure evidence', async () => {
    const { env, root } = fixture();
    const base = successfulExecute([]);
    const execute = async (command, args, options) => {
      if (args.join(' ').includes('dumpsys window windows')) {
        return result('mCurrentFocus=Window{abc u0 com.android.systemui/.permission.PermissionDialog}\n');
      }
      if (args.join(' ').includes('pidof')) return result('');
      return base(command, args, options);
    };
    await expect(runWindowsAndroidLabUiAutomation({
      argv: ['--testId', 'companion-tab-settings'], env, execute
    })).rejects.toMatchObject({ code: 'wrong_page_or_system_ui' });
    expect(fs.existsSync(path.join(root, 'on-failure.png'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'action-receipt.json'), 'utf8'))).toMatchObject({
      errorCode: 'wrong_page_or_system_ui', resultStatus: 'failure'
    });
  });
});
