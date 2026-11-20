/* global process */

import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';
import { parseTasklistSessionId, resolveAppLaunchTarget } from './foliole-agent-open.mjs';

let tempRoot;
let descriptorPath;
let pidPath;

const FAKE_APP = `#!${process.execPath}
const fs = require('node:fs');
const http = require('node:http');
const server = http.createServer((request, response) => {
  response.writeHead(request.url === '/agent-control/v1/health' ? 200 : 404, { 'content-type': 'application/json' });
  response.end('{"ok":true}');
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(process.env.FAKE_PID_PATH, String(process.pid));
  fs.writeFileSync(process.env.FAKE_DESCRIPTOR_PATH, JSON.stringify({
    capabilities: [], endpoint: 'http://127.0.0.1:' + server.address().port, token: 'token',
    inherited_run_as_node: process.env.ELECTRON_RUN_AS_NODE ?? null
  }));
});
setTimeout(() => process.exit(0), 30000);
`;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-open-'));
  descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  pidPath = path.join(tempRoot, 'app.pid');
});

afterEach(async () => {
  const pid = Number(await readFile(pidPath, 'utf8').catch(() => ''));
  if (pid) {
    try {
      process.kill(pid);
    } catch {
      // The fake app may already have exited.
    }
  }
  await rm(tempRoot, { force: true, recursive: true });
});

async function writeFakeApp() {
  const appPath = path.join(tempRoot, 'fake-foliole');
  await writeFile(appPath, FAKE_APP);
  await chmod(appPath, 0o755);
  return appPath;
}

function cliEnv(extra = {}) {
  return { FOLIOLE_AGENT_DESCRIPTOR: descriptorPath, ...extra };
}

describe('foliole open', () => {
  it('reports a running session without starting another app', async () => {
    await writeFile(descriptorPath, JSON.stringify({ capabilities: [], endpoint: 'http://127.0.0.1:1', token: 't' }));
    const launchApp = vi.fn();
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const result = await runAgentCli(['open'], { env: cliEnv(), fetch: fetchImpl, launchApp });
    expect(result).toEqual({ output: { status: 'running' }, status: 0 });
    expect(launchApp).not.toHaveBeenCalled();
  });

  it('starts the installed app, replacing a stale descriptor, and waits until Agent Control answers', async () => {
    await writeFile(descriptorPath, JSON.stringify({ capabilities: [], endpoint: 'http://127.0.0.1:9', token: 'old' }));
    const appPath = await writeFakeApp();
    const env = cliEnv({
      ELECTRON_RUN_AS_NODE: '1', FAKE_DESCRIPTOR_PATH: descriptorPath, FAKE_PID_PATH: pidPath,
      FOLIOLE_APP_LAUNCH_PATH: appPath, PATH: process.env.PATH
    });
    const result = await runAgentCli(['open'], { env, intervalMs: 50, platform: 'linux', timeoutMs: 10_000 });
    expect(result).toEqual({ output: { status: 'started' }, status: 0 });
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    expect(descriptor.token).toBe('token');
    expect(descriptor.inherited_run_as_node).toBeNull();
    const again = await runAgentCli(['open'], { env, platform: 'linux' });
    expect(again).toEqual({ output: { status: 'running' }, status: 0 });
  });

  it('refuses to start the app from a non-interactive Windows session', async () => {
    const launchApp = vi.fn();
    const result = await runAgentCli(['open'], {
      env: cliEnv({ FOLIOLE_APP_LAUNCH_PATH: 'C:\\Foliole\\Foliole.exe' }), launchApp,
      platform: 'win32', readSessionId: async () => 0
    });
    expect(result).toEqual({ output: { error: 'interactive_session_required' }, status: 3 });
    expect(launchApp).not.toHaveBeenCalled();
  });

  it('reports when the CLI is not installed with a desktop app to start', async () => {
    const result = await runAgentCli(['open'], { env: cliEnv(), execPath: '/usr/bin/node', versions: {} });
    expect(result).toEqual({ output: { error: 'launch_unavailable' }, status: 3 });
  });

  it('times out instead of waiting forever when the app never becomes ready', async () => {
    const result = await runAgentCli(['open'], {
      env: cliEnv({ FOLIOLE_APP_LAUNCH_PATH: '/Applications/Foliole.app' }), intervalMs: 10,
      launchApp: async () => {}, platform: 'darwin', timeoutMs: 50
    });
    expect(result).toEqual({ output: { error: 'launch_timeout' }, status: 3 });
  });

  it('rejects extra arguments and documents the command', async () => {
    expect(await runAgentCli(['open', '--now', 'yes'], { env: cliEnv() }))
      .toEqual({ output: { error: 'invalid_argument' }, status: 2 });
    const help = await runAgentCli(['open', '--help'], { env: {} });
    expect(help.status).toBe(0);
    expect(help.output).toContain('foliole open');
  });
});

describe('open launch target', () => {
  it('uses the packaged app executable when the CLI runs through it in Node mode', () => {
    expect(resolveAppLaunchTarget({ env: { ELECTRON_RUN_AS_NODE: '1' }, execPath: 'C:\\Foliole\\Foliole.exe', versions: { electron: '1' } }))
      .toBe('C:\\Foliole\\Foliole.exe');
    expect(resolveAppLaunchTarget({ env: {}, execPath: '/usr/bin/node', versions: {} })).toBeNull();
  });

  it('reads the Windows session number from tasklist CSV output', () => {
    expect(parseTasklistSessionId('"node.exe","4120","Services","0","40,000 K"\r\n')).toBe(0);
    expect(parseTasklistSessionId('"Foliole.exe","88","Console","2","1,024 K"')).toBe(2);
    expect(parseTasklistSessionId('INFO: No tasks are running')).toBeNull();
  });
});
