#!/usr/bin/env node
/* global clearTimeout, console, process, setTimeout */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXPECTED_SMOKE_ANSWER, isOnlineSmokeSuccessful } from './foliole-aide-online-smoke-success.mjs';

const MCP_PROTOCOL_VERSION = 1;
const CODEX_TIMEOUT_MS = 90_000;
const SMOKE_MATERIAL_ID = 'smoke-topic';
const SMOKE_TITLE = 'Aide MCP Smoke Topic';
const SMOKE_TOKEN = 'smoke-token';

export async function runOnlineSmoke(options = {}) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-aide-online-smoke-'));
  const tracePath = path.join(tempRoot, 'agent-control-mcp-trace.jsonl');
  const descriptorPath = path.join(tempRoot, 'agent-control-session.json');
  const apiRequests = [];
  const apiServer = await createSmokeApi(apiRequests);
  const endpoint = `http://127.0.0.1:${apiServer.address().port}`;
  await writeFile(descriptorPath, JSON.stringify({
    capabilities: ['materials.read'],
    endpoint,
    protocol_version: MCP_PROTOCOL_VERSION,
    token: 'smoke-token'
  }));

  try {
    const result = await runCodexTurn({
      codexCommand: options.codexCommand ?? 'codex',
      descriptorPath,
      prompt: createSmokePrompt(),
      tracePath
    });
    const trace = await readTrace(tracePath);
    return {
      apiRequests,
      assistantText: result.assistantText,
      ok: isOnlineSmokeSuccessful(result.assistantText, trace, apiRequests),
      providerThreadId: result.providerThreadId,
      trace,
      tracePath
    };
  } finally {
    await closeServer(apiServer);
    if (!options.keepTemp) await rm(tempRoot, { force: true, recursive: true });
  }
}

export function createSmokePrompt() {
  return [
    'Use the Foliole MCP tool foliole_materials_read with id smoke-topic.',
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
  if (category === 'auth_failed') return 'Codex app-server rejected the session. Open Codex and sign in before rerunning the smoke.';
  if (category === 'not_configured') return 'The codex command was not available to the smoke runner.';
  if (category === 'timeout') return 'Codex app-server did not complete the turn before the smoke timeout.';
  return 'Inspect the smoke error and Codex app-server logs.';
}

export function buildCodexAppServerArgs(descriptorPath) {
  const mcpServerPath = path.resolve('scripts', 'agent-control', 'foliole-mcp-server.mjs');
  return [
    'app-server',
    '-c',
    'mcp_servers.foliole_agent_control.command="node"',
    '-c',
    `mcp_servers.foliole_agent_control.args=[${tomlString(mcpServerPath)},'--descriptor',${tomlString(descriptorPath)}]`
  ];
}

function tomlString(value) {
  if (value.includes("'")) return JSON.stringify(value);
  return `'${value}'`;
}

async function createSmokeApi(apiRequests) {
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
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function runCodexTurn(input) {
  const child = spawn(input.codexCommand, buildCodexAppServerArgs(input.descriptorPath), {
    cwd: path.resolve('.'),
    env: { ...process.env, FOLIOLE_AGENT_MCP_TRACE_PATH: input.tracePath },
    shell: process.platform === 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const session = createJsonRpcSession(child);
  try {
    await session.request({ id: 0, method: 'initialize', params: { clientInfo: { name: 'foliole_aide_smoke', version: '0.1.0' } } });
    session.notify({ method: 'initialized', params: {} });
    const thread = await session.request({ id: 1, method: 'thread/start', params: {} });
    const threadId = thread.result?.thread?.id;
    if (typeof threadId !== 'string') throw new Error('missing_thread_id');
    child.stdin.write(`${JSON.stringify({ id: 2, method: 'turn/start', params: { input: [{ text: input.prompt, type: 'text' }], threadId } })}\n`);
    const assistantText = await session.waitForTurn();
    return { assistantText, providerThreadId: threadId };
  } finally {
    child.kill();
  }
}

function createJsonRpcSession(child) {
  const pending = new Map();
  let assistantText = '';
  let turnComplete;
  let stderr = '';
  const timeout = setTimeout(() => {
    const error = new Error(`codex_app_server_timeout${stderr ? `: ${stderr.slice(0, 500)}` : ''}`);
    for (const item of pending.values()) item.reject(error);
    turnComplete?.reject(error);
    child.kill();
  }, CODEX_TIMEOUT_MS);
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/u).filter(Boolean)) handleMessage(JSON.parse(line));
  });
  child.on('error', (error) => {
    for (const item of pending.values()) item.reject(error);
    turnComplete?.reject(error);
  });
  function handleMessage(message) {
    if (message.id !== undefined && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message);
      return;
    }
    if (message.method === 'item/agentMessage/delta') assistantText += message.params?.delta ?? message.params?.text ?? '';
    if (message.method === 'turn/completed') turnComplete?.resolve(assistantText);
    if (message.method === 'error') turnComplete?.reject(new Error(JSON.stringify(message.params ?? message)));
  }
  return {
    notify(message) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    },
    request(message) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
      return new Promise((resolve, reject) => pending.set(message.id, { reject, resolve }));
    },
    waitForTurn() {
      return new Promise((resolve, reject) => {
        turnComplete = { reject, resolve };
      }).finally(() => clearTimeout(timeout));
    }
  };
}

async function readTrace(tracePath) {
  try {
    const text = await readFile(tracePath, 'utf8');
    return text.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
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
