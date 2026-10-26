// @vitest-environment node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runT234WebViewSession, webViewSocketForPid } from './macos-a5-t234-webview-session.mjs';

it('discovers the fixed socket when unrelated system sockets exceed the capture buffer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-webview-large-'));
  const sockets = path.join(root, 'unix');
  fs.writeFileSync(sockets, '000: unrelated_socket\n'.repeat(80000) + '001: @webview_devtools_remote_42\n');
  try {
    const captured = (_adb, args) => {
      if (args.includes('pidof')) return '42';
      if (args.includes('packages')) return '';
      return execSync(args.slice(3).join(' ').replace('/proc/net/unix', sockets), { encoding: 'utf8' });
    };
    await runT234WebViewSession({
      assertFixed: vi.fn(), buildIdentity: () => 'large', captured, checked: vi.fn(),
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' },
      serial: '87a33a4b', waitForEnd: async () => {},
      execute: vi.fn(async () => ({ code: 1, stderr: 'No test device' }))
    });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'a5-t234-webview-session/large/session.json'), 'utf8')))
      .toMatchObject({ status: 'closed', socket: 'webview_devtools_remote_42' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('selects only the WebView socket belonging to the fixed app process', () => {
  const sockets = '000: @webview_devtools_remote_42\n001: @webview_devtools_remote_43\n';
  expect(webViewSocketForPid(sockets, '43')).toBe('webview_devtools_remote_43');
  expect(() => webViewSocketForPid(sockets, '44')).toThrow('Expected one');
});

it('holds the fixed session and restores the main app when it closes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-t234-a5-'));
  try {
    const checked = vi.fn();
    const captured = vi.fn((_adb, args) => {
      if (args.includes('pidof')) return '42\n';
      if (args.includes('packages')) return `package:${args.at(-1)}\n`;
      return '000: @webview_devtools_remote_42\n';
    });
    const waitForEnd = vi.fn(async () => {});
    await runT234WebViewSession({
      assertFixed: vi.fn(), buildIdentity: () => 'revision', captured, checked,
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' },
      serial: '87a33a4b', waitForEnd,
      execute: vi.fn(async () => ({ code: 1, stderr: 'No test device' }))
    });
    expect(waitForEnd).toHaveBeenCalledOnce();
    expect(checked.mock.calls[0][1]).toContain(
      'com.campfirium.foliole.android.acceptance/com.foliole.android.MainActivity');
    expect(checked.mock.calls.some(([, args]) => args.includes(
      'com.campfirium.foliole.android/com.foliole.android.MainActivity'))).toBe(true);
    expect(checked.mock.calls.filter(([, args]) => args.includes('uninstall')).length).toBe(2);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'a5-t234-webview-session',
      'revision', 'session.json'), 'utf8'))).toMatchObject({
      appId: 'com.campfirium.foliole.android.acceptance', pid: 42, serial: '87a33a4b',
      socket: 'webview_devtools_remote_42', status: 'closed'
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('restores the main app if WebView discovery fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-t248-a5-'));
  try {
    const checked = vi.fn();
    await expect(runT234WebViewSession({
      assertFixed: vi.fn(), buildIdentity: () => 'failed',
      captured: vi.fn(() => ''), checked,
      execute: vi.fn(async () => ({ code: 1, stderr: 'No test device' })),
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' },
      serial: '87a33a4b'
    })).rejects.toThrow('Expected one fixed A5 process');
    expect(checked.mock.calls.some(([, args]) => args.includes(
      'com.campfirium.foliole.android/com.foliole.android.MainActivity'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'a5-t234-webview-session',
      'failed', 'session.json'), 'utf8'))).toMatchObject({ status: 'failed' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('captures acceptance startup logs before restoring the daily app and preserves the launch failure', async () => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/a5-launch-failure-'));
  const events = [];
  const original = new Error('Acceptance activity did not stay foreground');
  const checked = vi.fn((_command, args) => {
    if (args.some(arg => String(arg).endsWith('verify-android-launch.mjs'))) throw original;
    if (args.includes('com.campfirium.foliole.android/com.foliole.android.MainActivity')) events.push('restore');
  });
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('logcat')) {
      events.push('logs');
      return { code: 0, stdout: '10-26 10:00:00.000 42 42 E AndroidRuntime: com.campfirium.foliole.android.acceptance crashed\n'
        + '10-26 10:00:00.001 99 99 I PrivateApp: unrelated data' };
    }
    if (args.includes('pidof')) return { code: 0, stdout: '42' };
    return { code: 0, stdout: '' };
  });
  try {
    await expect(runT234WebViewSession({ assertFixed: vi.fn(), buildIdentity: () => 'failed',
      captured: vi.fn(() => ''), checked, execute, serial: '87a33a4b',
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' }
    })).rejects.toBe(original);
    expect(events).toContain('logs');
    expect(events.at(-1)).toBe('restore');
    expect(events.slice(0, -1).every(event => event === 'logs')).toBe(true);
    const log = fs.readFileSync(path.join(root,
      'a5-t234-webview-session/failed/instrumentation-failure/logcat-tail.txt'), 'utf8');
    expect(log).toContain('acceptance crashed');
    expect(log).not.toContain('unrelated data');
    expect(JSON.parse(fs.readFileSync(path.join(root,
      'a5-t234-webview-session/failed/session.json'), 'utf8')).status).toBe('failed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


it('captures bounded session diagnostics before restoring the daily app without failing a closed session', async () => {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/a5-session-diagnostic-'));
  const events = [];
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('logcat')) {
      events.push('logs');
      return { code: 0, stdout: '10-27 10:00:00.000 42 42 I Capacitor: pending operation\n' };
    }
    return { code: 0, stdout: args.includes('pidof') ? '42' : '' };
  });
  try {
    await runT234WebViewSession({ assertFixed: vi.fn(), buildIdentity: () => 'ended',
      captured: (_command, args) => args.includes('pidof') ? '42' : args.includes('packages') ? '' : '000: @webview_devtools_remote_42',
      checked: (_command, args) => {
        if (args.includes('com.campfirium.foliole.android/com.foliole.android.MainActivity')) events.push('restore');
      }, execute, serial: '87a33a4b', waitForEnd: async () => { events.push('end'); },
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' }
    });
    expect(events).toEqual(['end', 'logs', 'logs', 'restore']);
    const directory = path.join(root, 'a5-t234-webview-session/ended');
    expect(fs.readFileSync(path.join(directory, 'instrumentation-failure/logcat-tail.txt'), 'utf8')).toContain('pending operation');
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'session.json'), 'utf8')).status).toBe('closed');
    expect(execute.mock.calls.every(([, args]) => !args.includes('force-stop') && !args.includes('clear'))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
