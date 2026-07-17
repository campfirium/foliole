#!/usr/bin/env node
/* global console, fetch, process, setTimeout */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOnlineSmokeJsonRpcSession } from './foliole-aide-online-smoke-session.mjs';
import { EXPECTED_SMOKE_ANSWER, isOnlineSmokeSuccessful } from './foliole-aide-online-smoke-success.mjs';

const CODEX_TIMEOUT_MS = 180_000;
const SMOKE_MATERIAL_ID = 'smoke-topic';
const SMOKE_TITLE = 'Aide CLI Smoke Topic';
const SMOKE_TOKEN = 'smoke-token';

export async function runOnlineSmoke(options = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-aide-online-smoke-'));
  const apiRequests = [];
  const apiServer = await createSmokeApi(apiRequests);
  const endpoint = `http://127.0.0.1:${apiServer.address().port}`;
  try {
    const result = await runCodexTurn({
      codexCommand: options.codexCommand ?? 'codex',
      cwd: tempRoot,
      endpoint,
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
    'Use the Foliole read tool to read the Foliole Topic with id smoke-topic.',
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
  return ['app-server', '--disable', 'code_mode', '--disable', 'shell_tool', '--disable', 'unified_exec'];
}

export function createSmokeThreadStartParams(cwd) {
  return {
    cwd,
    dynamicTools: [{
      type: 'namespace',
      name: 'foliole',
      description: 'Read Foliole Topics.',
      tools: [{
        type: 'function',
        name: 'read_material',
        description: 'Read one Foliole Topic or Folder by id.',
        inputSchema: {
          type: 'object', additionalProperties: false,
          properties: { id: { type: 'string' } }, required: ['id']
        }
      }]
    }],
    ephemeral: true,
    sandbox: 'read-only'
  };
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
  const child = spawn(input.codexCommand, buildCodexAppServerArgs(), {
    cwd: input.cwd,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const session = createOnlineSmokeJsonRpcSession(child, CODEX_TIMEOUT_MS, (message) => {
    return executeSmokeTool(message, input.endpoint);
  });
  try {
    await session.request({
      id: 0,
      method: 'initialize',
      params: {
        capabilities: { experimentalApi: true },
        clientInfo: { name: 'foliole_aide_smoke', version: '0.1.0' }
      }
    });
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
        sandboxPolicy: { networkAccess: 'restricted', type: 'externalSandbox' },
        threadId
      }
    });
    const assistantText = await completed;
    return { assistantText, providerThreadId: threadId };
  } finally {
    await stopCodexAppServer(child);
  }
}

async function executeSmokeTool(message, endpoint) {
  const params = message.params ?? {};
  if (params.namespace !== 'foliole' || params.tool !== 'read_material') {
    return { contentItems: [{ type: 'inputText', text: '{"error":"unknown_tool"}' }], success: false };
  }
  const response = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
    body: JSON.stringify(params.arguments ?? {}),
    headers: { authorization: `Bearer ${SMOKE_TOKEN}`, 'content-type': 'application/json' },
    method: 'POST'
  });
  const payload = await response.json();
  return {
    contentItems: [{ type: 'inputText', text: JSON.stringify(payload) }],
    success: response.ok
  };
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
