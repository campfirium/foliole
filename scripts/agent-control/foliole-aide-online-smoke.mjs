#!/usr/bin/env node
/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOnlineSmokeJsonRpcSession } from './foliole-aide-online-smoke-session.mjs';
import { EXPECTED_SMOKE_ANSWER, isOnlineSmokeSuccessful } from './foliole-aide-online-smoke-success.mjs';

const AGENT_CONTROL_PROTOCOL_VERSION = 1;
const CODEX_TIMEOUT_MS = 180_000;
const SMOKE_MATERIAL_ID = 'smoke-topic';
const SMOKE_TITLE = 'Aide CLI Smoke Topic';
const SMOKE_TOKEN = 'smoke-token';

export async function runOnlineSmoke(options = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-aide-online-smoke-'));
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  const apiRequests = [];
  const apiServer = await createSmokeApi(apiRequests);
  const endpoint = `http://127.0.0.1:${apiServer.address().port}`;
  await writeFile(descriptorPath, JSON.stringify({
    capabilities: ['materials.read'],
    endpoint,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    token: 'smoke-token'
  }));

  try {
    const result = await runCodexTurn({
      codexCommand: options.codexCommand ?? 'codex',
      cwd: tempRoot,
      descriptorPath,
      prompt: createSmokePrompt()
    });
    return {
      apiRequests,
      assistantText: result.assistantText,
      ok: isOnlineSmokeSuccessful(result.assistantText, apiRequests, result.providerThreadId),
      providerThreadId: result.providerThreadId
    };
  } finally {
    await closeServer(apiServer);
    if (!options.keepTemp) await rm(tempRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
  }
}

export function createSmokePrompt() {
  return [
    'Use the self-describing foliole command to read the Foliole Topic with id smoke-topic.',
    'Discover its syntax with foliole help --json if needed.',
    `Then answer exactly: ${EXPECTED_SMOKE_ANSWER}.`
  ].join(' ');
}

export function classifyOnlineSmokeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  const normalized = text.toLowerCase();
  if (
    normalized.includes('401 unauthorized') ||
    normalized.includes('missing bearer') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('auth')
  ) {
    return 'auth_failed';
  }
  if (normalized.includes('codex_app_server_timeout')) return 'timeout';
  if (normalized.includes('enoent')) return 'not_configured';
  return 'internal_error';
}

export function describeOnlineSmokeFailure(category) {
  if (category === 'auth_failed') return 'Codex app-server did not expose an authenticated account to Foliole.';
  if (category === 'not_configured') return 'The codex command was not available to the smoke runner.';
  if (category === 'timeout') return 'Codex app-server did not complete the turn before the smoke timeout.';
  return 'Inspect the smoke error and Codex app-server logs.';
}

export function buildCodexAppServerArgs() {
  return ['app-server'];
}

export function createSmokeThreadStartParams(cwd) {
  return { cwd, ephemeral: true };
}

export async function createSmokeApi(apiRequests) {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      apiRequests.push({ authorization: request.headers.authorization, body: body ? JSON.parse(body) : null, method: request.method, url: request.url });
      if (request.url === '/agent-control/v1/materials/read') {
        if (request.headers.authorization !== `Bearer ${SMOKE_TOKEN}`) {
          response.writeHead(401, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          material: {
            child_count: 0,
            children: [],
            content: 'Smoke body from Foliole Agent Control.',
            id: SMOKE_MATERIAL_ID,
            title: SMOKE_TITLE
          }
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function runCodexTurn(input) {
  const commandDir = path.resolve('scripts', 'agent-control');
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  const child = spawn(input.codexCommand, buildCodexAppServerArgs(), {
    cwd: input.cwd,
    env: {
      ...process.env,
      FOLIOLE_AGENT_DESCRIPTOR: input.descriptorPath,
      [pathKey]: `${commandDir}${path.delimiter}${process.env[pathKey] ?? ''}`
    },
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const session = createOnlineSmokeJsonRpcSession(child, CODEX_TIMEOUT_MS);
  try {
    await session.request({ id: 0, method: 'initialize', params: { clientInfo: { name: 'foliole_aide_smoke', version: '0.1.0' } } });
    session.notify({ method: 'initialized', params: {} });
    const thread = await session.request({
      id: 1,
      method: 'thread/start',
      params: createSmokeThreadStartParams(input.cwd)
    });
    const threadId = thread.result?.thread?.id;
    if (typeof threadId !== 'string') throw new Error('missing_thread_id');
    const completed = session.waitForTurn();
    await session.request({
      id: 2,
      method: 'turn/start',
      params: {
        approvalPolicy: 'never', cwd: input.cwd,
        input: [{ text: input.prompt, type: 'text' }],
        sandboxPolicy: {
          excludeSlashTmp: true, excludeTmpdirEnvVar: true, networkAccess: true,
          type: 'workspaceWrite', writableRoots: [input.cwd]
        },
        threadId
      }
    });
    const assistantText = await completed;
    return { assistantText, providerThreadId: threadId };
  } finally {
    await stopCodexAppServer(child);
  }
}

async function stopCodexAppServer(child) {
  if (child.exitCode !== null) return;
  child.stdin.end();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2_000))
  ]);
  if (!graceful && child.exitCode === null) {
    child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1_000))]);
  }
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runOnlineSmoke({ keepTemp: process.argv.includes('--keep-temp') });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    const category = classifyOnlineSmokeError(error);
    console.log(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      failure: { category },
      hint: describeOnlineSmokeFailure(category),
      ok: false
    }, null, 2));
    process.exitCode = 1;
  }
}
