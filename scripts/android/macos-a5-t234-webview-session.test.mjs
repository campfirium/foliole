// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runT234WebViewSession, webViewSocketForPid } from './macos-a5-t234-webview-session.mjs';

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
      serial: '87a33a4b', waitForEnd
    });
    expect(waitForEnd).toHaveBeenCalledOnce();
    expect(checked.mock.calls[0][1]).toContain(
      'com.foliole.android.acceptance/com.foliole.android.MainActivity');
    expect(checked.mock.calls.some(([, args]) => args.includes(
      'com.foliole.android/com.foliole.android.MainActivity'))).toBe(true);
    expect(checked.mock.calls.filter(([, args]) => args.includes('uninstall')).length).toBe(2);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'a5-t234-webview-session',
      'revision', 'session.json'), 'utf8'))).toMatchObject({
      appId: 'com.foliole.android.acceptance', pid: 42, serial: '87a33a4b',
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
      paths: { adb: '/fixed/adb', artifactsRoot: root, buildRoot: '/fixed/source' },
      serial: '87a33a4b'
    })).rejects.toThrow('Expected one fixed A5 process');
    expect(checked.mock.calls.some(([, args]) => args.includes(
      'com.foliole.android/com.foliole.android.MainActivity'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'a5-t234-webview-session',
      'failed', 'session.json'), 'utf8'))).toMatchObject({ status: 'failed' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
