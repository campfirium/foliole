#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';

const APP_ID = 'com.foliole.android';
const TEST_RUNNER = `${APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionWebViewAutomationTest#performsBoundedSemanticAction`;
const TEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const UI_ARGUMENTS = new Set(['action', 'expectedAttribute', 'expectedValue', 'testId', 'timeoutMs', 'value']);

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function parseUiAutomationArgs(argv) {
  const values = { action: 'click', expectedAttribute: 'aria-current', expectedValue: 'page', timeoutMs: 10_000 };
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw codedError('ui_arguments_invalid', 'UI arguments must be name/value pairs');
    const key = name.slice(2);
    if (!UI_ARGUMENTS.has(key)) throw codedError('ui_arguments_invalid', `unsupported UI argument: ${name}`);
    values[key] = value;
  }
  if (!TEST_ID.test(values.testId || '') || !['click', 'input'].includes(values.action)) {
    throw codedError('ui_arguments_invalid', 'a stable testId and click or input action are required');
  }
  values.timeoutMs = Number(values.timeoutMs);
  if (!Number.isSafeInteger(values.timeoutMs) || values.timeoutMs < 1_000 || values.timeoutMs > 30_000) {
    throw codedError('ui_arguments_invalid', 'timeoutMs is outside 1000..30000');
  }
  if (!/^[A-Za-z_:][-A-Za-z0-9_:.]{0,79}$/u.test(values.expectedAttribute || '') || String(values.expectedValue).length > 200) {
    throw codedError('ui_arguments_invalid', 'expected attribute contract is invalid');
  }
  if ((values.action === 'input') !== (typeof values.value === 'string') || Buffer.byteLength(values.value || '') > 4_096) {
    throw codedError('ui_arguments_invalid', 'input actions require a bounded value and click actions do not accept one');
  }
  return values;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs || 120_000);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdoutBuffer = Buffer.concat(stdout);
      const result = { code, stderr: Buffer.concat(stderr).toString('utf8'), stdout: stdoutBuffer.toString('utf8'), stdoutBuffer };
      if (code === 0) resolve(result);
      else reject(Object.assign(codedError(timedOut ? 'ui_command_timeout' : 'ui_command_failed',
        timedOut ? `${path.basename(command)} timed out` : `${path.basename(command)} exited ${code}`), result));
    });
  });
}

function parseInstrumentationEvidence(output) {
  const evidence = {};
  const keys = {
    folioleActionReceipt: 'receipt', folioleAfterSemantic: 'after', folioleBeforeSemantic: 'before'
  };
  for (const line of String(output).split(/\r?\n/u)) {
    const match = /^INSTRUMENTATION_STATUS: ([A-Za-z]+)=(.*)$/u.exec(line);
    if (match && keys[match[1]]) evidence[keys[match[1]]] = JSON.parse(match[2]);
  }
  if (!evidence.before || !evidence.after || !evidence.receipt) {
    throw codedError('ui_evidence_missing', 'instrumentation did not return complete semantic evidence');
  }
  return evidence;
}

function nativeUiSummary(xml, size, inputState) {
  const nodes = [];
  for (const match of String(xml).matchAll(/<node\s+([^>]+)>?/gu)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((entry) => [entry[1], entry[2]]));
    nodes.push({
      bounds: attributes.bounds || '', className: attributes.class || '', clickable: attributes.clickable === 'true',
      enabled: attributes.enabled !== 'false', focused: attributes.focused === 'true', packageName: attributes.package || '',
      resourceId: attributes['resource-id'] || '', selected: attributes.selected === 'true'
    });
  }
  const physicalSize = /Physical size:\s*(\d+x\d+)/iu.exec(size)?.[1] || '';
  const orientation = /SurfaceOrientation:\s*(\d+)/iu.exec(inputState)?.[1] || '';
  return { device: { orientation, physicalSize }, nodes: nodes.slice(0, 500), schemaVersion: 1 };
}

function assertAwakeAndUnlocked(policy, power) {
  if (!/mWakefulness=Awake/iu.test(power)) throw codedError('device_locked', 'A5 is not awake');
  if (/mShowingLockscreen=true|isStatusBarKeyguard=true|mDreamingLockscreen=true/iu.test(policy)) {
    throw codedError('device_locked', 'A5 is locked');
  }
}

async function wakeDevice(invoke, adb, adbArgs) {
  await invoke(adb, adbArgs('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'));
}

function assertFolioleForeground(windowState) {
  const focus = /mCurrentFocus=[^\n]*\s([A-Za-z0-9._]+)\//u.exec(windowState)?.[1] || '';
  const resumed = new RegExp(`mResumeActivity:[^\\n]*\\s${APP_ID.replaceAll('.', '\\.')}[/.]`, 'u').test(windowState);
  const target = new RegExp(`\\b(?:mObscuringWindow|ime(?:Layering|Input|Control)Target)[^\\n]*\\s${APP_ID.replaceAll('.', '\\.')}[/.]`, 'u')
    .test(windowState);
  if (focus !== APP_ID && !resumed && !target) {
    throw codedError('wrong_page_or_system_ui', `Foliole is not foreground; current package is ${focus || 'unknown'}`);
  }
}

function instrumentationArgs(input) {
  const pairs = [
    ['class', TEST_CLASS], ['testId', input.testId], ['action', input.action],
    ['expectedAttribute', input.expectedAttribute], ['expectedValue', String(input.expectedValue)],
    ['timeoutMs', String(input.timeoutMs)]
  ];
  if (input.value !== undefined) pairs.push(['valueBase64', Buffer.from(input.value).toString('base64')]);
  return ['shell', 'am', 'instrument', '-w', '-r', ...pairs.flatMap(([name, value]) => ['-e', name, value]), TEST_RUNNER];
}

function auditedArgs(args) {
  return args.map((value, index) => (
    args[index - 1] === '--value' || (args[index - 2] === '-e' && args[index - 1] === 'valueBase64') ? '<redacted>' : value
  ));
}

export async function runWindowsAndroidLabUiAutomation({
  argv = process.argv.slice(2), env = process.env, execute = runProcess
} = {}) {
  const input = parseUiAutomationArgs(argv);
  const adb = env.FOLIOLE_ANDROID_ADB_PATH;
  const serial = env.FOLIOLE_ANDROID_SERIAL;
  const evidenceRoot = env.FOLIOLE_ANDROID_LAB_EVIDENCE_ROOT;
  const windowsWorkDir = env.ANDROID_WINDOWS_WORKDIR;
  if (!adb || !serial || !evidenceRoot || !windowsWorkDir) throw codedError('ui_environment_missing', 'verified Lab UI environment is missing');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const commands = [];
  const invoke = async (command, args, options = {}) => {
    const startedAt = new Date().toISOString();
    try {
      const result = await execute(command, args, { env, ...options });
      commands.push({ args: auditedArgs(args), command, exitCode: 0, startedAt, completedAt: new Date().toISOString() });
      return result;
    } catch (error) {
      commands.push({ args: auditedArgs(args), command, errorCode: error.code || 'failed', exitCode: error.exitCode ?? null,
        startedAt, completedAt: new Date().toISOString() });
      throw error;
    }
  };
  const adbArgs = (...args) => ['-s', serial, ...args];
  try {
    await invoke(env.FOLIOLE_ANDROID_BASH_PATH || 'bash', ['scripts/android/windows-gradle-check.sh', 'assembleDebugAndroidTest'], { timeoutMs: 15 * 60_000 });
    const testApk = path.win32.join(windowsWorkDir, 'android', 'app', 'build', 'outputs', 'apk', 'androidTest', 'debug', 'app-debug-androidTest.apk');
    await invoke(adb, adbArgs('install', '-r', '-t', testApk), { timeoutMs: 120_000 });
    await wakeDevice(invoke, adb, adbArgs);
    const policy = await invoke(adb, adbArgs('shell', 'dumpsys', 'window', 'policy'));
    const power = await invoke(adb, adbArgs('shell', 'dumpsys', 'power'));
    assertAwakeAndUnlocked(policy.stdout, power.stdout);
    await invoke(adb, adbArgs('shell', 'am', 'start', '-W', '-n', `${APP_ID}/${APP_ID}.MainActivity`));
    const windowState = await invoke(adb, adbArgs('shell', 'dumpsys', 'window', 'windows'));
    assertFolioleForeground(windowState.stdout);
    fs.writeFileSync(path.join(evidenceRoot, 'before.png'), (await invoke(adb, adbArgs('exec-out', 'screencap', '-p'))).stdoutBuffer);
    await invoke(adb, adbArgs('shell', 'uiautomator', 'dump', '/sdcard/foliole-window.xml'));
    const nativeXml = await invoke(adb, adbArgs('exec-out', 'cat', '/sdcard/foliole-window.xml'));
    const size = await invoke(adb, adbArgs('shell', 'wm', 'size'));
    const inputState = await invoke(adb, adbArgs('shell', 'dumpsys', 'input'));
    fs.writeFileSync(path.join(evidenceRoot, 'native-ui-summary.json'), `${JSON.stringify(
      nativeUiSummary(nativeXml.stdout, size.stdout, inputState.stdout), null, 2
    )}\n`);
    await invoke(adb, adbArgs('shell', 'rm', '/sdcard/foliole-window.xml'));
    const instrumentation = await invoke(adb, adbArgs(...instrumentationArgs(input)), { timeoutMs: input.timeoutMs + 30_000 });
    const semantic = parseInstrumentationEvidence(instrumentation.stdout);
    if (semantic.receipt.targetTestId !== input.testId || semantic.receipt.action !== input.action || semantic.receipt.ok !== true) {
      throw codedError('ui_receipt_mismatch', 'instrumentation receipt does not match the requested semantic action');
    }
    fs.writeFileSync(path.join(evidenceRoot, 'semantic-snapshot.json'), `${JSON.stringify({ before: semantic.before, after: semantic.after }, null, 2)}\n`);
    fs.writeFileSync(path.join(evidenceRoot, 'action-receipt.json'), `${JSON.stringify({ ...semantic.receipt, adapter: 'instrumentation-evaluateJavascript' }, null, 2)}\n`);
    fs.writeFileSync(path.join(evidenceRoot, 'after.png'), (await invoke(adb, adbArgs('exec-out', 'screencap', '-p'))).stdoutBuffer);
    return { adapter: 'instrumentation-evaluateJavascript', resultStatus: 'success', targetTestId: input.testId };
  } catch (error) {
    try {
      fs.writeFileSync(path.join(evidenceRoot, 'on-failure.png'), (await invoke(adb, adbArgs('exec-out', 'screencap', '-p'))).stdoutBuffer);
    } catch {
      // Preserve the primary UI failure when screenshot capture is unavailable.
    }
    try {
      const pid = (await invoke(adb, adbArgs('shell', 'pidof', APP_ID))).stdout.trim();
      if (pid) fs.writeFileSync(path.join(evidenceRoot, 'logcat.txt'), (await invoke(adb, adbArgs('logcat', `--pid=${pid}`, '-d', '-t', '800'))).stdout);
    } catch {
      // Preserve the primary UI failure when the app process or logcat is unavailable.
    }
    fs.writeFileSync(path.join(evidenceRoot, 'action-receipt.json'), `${JSON.stringify({
      adapter: 'instrumentation-evaluateJavascript', errorCode: error.code || 'ui_automation_failed',
      resultStatus: 'failure', targetTestId: input.testId
    }, null, 2)}\n`);
    throw error;
  } finally {
    fs.writeFileSync(path.join(evidenceRoot, 'ui-command-audit.json'), `${JSON.stringify({ commands, schemaVersion: 1 }, null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsAndroidLabUiAutomation().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(`[windows-android-lab-ui] ${error.code || 'failed'}: ${error.message}`);
    process.exitCode = 1;
  });
}
