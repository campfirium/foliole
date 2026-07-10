#!/usr/bin/env node
/* global process */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgentCli } from './foliole-agent.mjs';
import {
  buildMcpToolArgv,
  isMcpToolAvailable,
  listMcpToolsForCapabilities,
  MCP_TOOLS
} from './foliole-mcp-tools.mjs';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export { MCP_TOOLS };

export async function handleMcpLine(line, state = {}, options = {}) {
  try {
    return await handleMcpMessage(JSON.parse(line), state, options);
  } catch {
    return jsonError(null, -32700, 'parse_error');
  }
}

export async function handleMcpMessage(message, state = {}, options = {}) {
  if (!isJsonRpcMessage(message)) return jsonError(null, -32600, 'invalid_request');
  if (!Object.hasOwn(message, 'id')) return handleNotification(message, state);
  if (message.method === 'initialize') return handleInitialize(message, state);
  if (!state.initialized) return jsonError(message.id, -32002, 'not_initialized');
  if (message.method === 'tools/list') return listTools(message.id, options);
  if (message.method === 'tools/call') return callTool(message.id, message.params, options);
  return jsonError(message.id, -32601, 'method_not_found');
}

function handleNotification(message, state) {
  if (message.method === 'notifications/initialized') state.initialized = true;
  return null;
}

function handleInitialize(message, state) {
  if (message.params?.protocolVersion !== MCP_PROTOCOL_VERSION) {
    return jsonError(message.id, -32602, 'unsupported_protocol_version');
  }
  state.initialized = false;
  return jsonResult(message.id, {
    capabilities: { tools: { listChanged: false } },
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: { name: 'foliole-agent-control', title: 'Foliole Agent Control', version: '0.1.0' }
  });
}

async function callTool(id, params, options) {
  if (!params || typeof params.name !== 'string') return jsonError(id, -32602, 'invalid_params');
  const capabilities = await readDescriptorCapabilities(options.descriptor);
  if (!isMcpToolAvailable(params.name, capabilities)) {
    await writeToolTrace(params.name, 'error', 'unknown_tool', options);
    return jsonError(id, -32602, 'unknown_tool');
  }
  const argvResult = buildMcpToolArgv(params.name, params.arguments ?? {});
  if (!argvResult.ok) {
    await writeToolTrace(params.name, 'error', argvResult.error, options);
    return jsonError(id, -32602, argvResult.error);
  }
  const argv = withDescriptor(argvResult.argv, options.descriptor);
  const cli = options.runAgentCli ?? runAgentCli;
  const result = await cli(argv, { env: options.env });
  await writeToolTrace(params.name, result.status === 0 ? 'ok' : 'error', result.output?.error, options);
  return jsonResult(id, {
    content: [{ text: safeJson(result.output, options), type: 'text' }],
    isError: result.status !== 0
  });
}

async function writeToolTrace(tool, status, error, options) {
  const tracePath = options.tracePath ?? options.env?.FOLIOLE_AGENT_MCP_TRACE_PATH ?? process.env.FOLIOLE_AGENT_MCP_TRACE_PATH;
  if (!tracePath) return;
  try {
    await mkdir(path.dirname(tracePath), { recursive: true });
    await appendFile(tracePath, `${JSON.stringify({
      ...(error ? { error } : {}),
      status,
      timestamp: new Date().toISOString(),
      tool
    })}\n`);
  } catch {
    // Trace failures must not corrupt the MCP stdio protocol.
  }
}

async function listTools(id, options) {
  const capabilities = await readDescriptorCapabilities(options.descriptor);
  return jsonResult(id, { tools: listMcpToolsForCapabilities(capabilities) });
}

async function readDescriptorCapabilities(descriptorPath) {
  if (!descriptorPath) return [];
  try {
    const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'));
    return Array.isArray(descriptor.capabilities) ? descriptor.capabilities : [];
  } catch {
    return [];
  }
}

function withDescriptor(argv, descriptor) {
  return descriptor ? [...argv, '--descriptor', descriptor] : argv;
}

function isJsonRpcMessage(value) {
  return Boolean(value && typeof value === 'object' && value.jsonrpc === '2.0' &&
    typeof value.method === 'string' && (!Object.hasOwn(value, 'id') || ['number', 'string'].includes(typeof value.id)));
}

function safeJson(value, options) {
  const blocked = [options.descriptor, options.env?.FOLIOLE_AGENT_DESCRIPTOR, options.env?.FOLIOLE_AGENT_TOKEN]
    .filter(Boolean);
  let text = JSON.stringify(value);
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gu, 'Bearer [redacted]');
  text = text.replace(/"token"\s*:\s*"[^"]*"/gu, '"token":"[redacted]"');
  text = text.replace(/"authorization"\s*:\s*"[^"]*"/giu, '"authorization":"[redacted]"');
  for (const item of blocked) text = text.split(item).join('[redacted]');
  return text;
}

function jsonResult(id, result) {
  return { id, jsonrpc: '2.0', result };
}

function jsonError(id, code, message) {
  return { error: { code, message }, id, jsonrpc: '2.0' };
}

function parseServerArgv(argv) {
  const descriptorIndex = argv.indexOf('--descriptor');
  return descriptorIndex >= 0 ? { descriptor: argv[descriptorIndex + 1] } : {};
}

async function runStdioServer(options = {}) {
  const state = {};
  const rl = readline.createInterface({ crlfDelay: Infinity, input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const response = await handleMcpLine(line, state, options);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStdioServer(parseServerArgv(process.argv.slice(2)));
}
