#!/usr/bin/env node
/* global process */

import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAgentCli } from './foliole-agent.mjs';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const MCP_TOOLS = [
  {
    description: 'Check whether the Foliole Agent Control API is reachable.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'foliole_health',
    title: 'Foliole health'
  },
  {
    description: 'List capabilities enabled for the current Agent Control session.',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    name: 'foliole_capabilities',
    title: 'Foliole capabilities'
  },
  {
    description: 'Search readable Foliole materials by query.',
    inputSchema: {
      additionalProperties: false,
      properties: { limit: { minimum: 1, type: 'number' }, query: { minLength: 1, type: 'string' } },
      required: ['query'],
      type: 'object'
    },
    name: 'foliole_materials_search',
    title: 'Search Foliole materials'
  },
  {
    description: 'Read a Foliole material by id.',
    inputSchema: {
      additionalProperties: false,
      properties: { id: { minLength: 1, type: 'string' } },
      required: ['id'],
      type: 'object'
    },
    name: 'foliole_materials_read',
    title: 'Read Foliole material'
  }
];

const TOOL_COMMANDS = {
  foliole_capabilities: { argv: () => ['capabilities'] },
  foliole_health: { argv: () => ['health'] },
  foliole_materials_read: { argv: (args) => requireArgs(args, ['id'], () => ['materials/read', '--id', args.id]) },
  foliole_materials_search: { argv: (args) => requireArgs(args, ['query'], () => searchArgv(args)) }
};

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
  if (message.method === 'tools/list') return jsonResult(message.id, { tools: MCP_TOOLS });
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
  const tool = TOOL_COMMANDS[params.name];
  if (!tool) return jsonError(id, -32602, 'unknown_tool');
  const argvResult = tool.argv(params.arguments ?? {});
  if (!argvResult.ok) return jsonError(id, -32602, argvResult.error);
  const argv = withDescriptor(argvResult.argv, options.descriptor);
  const cli = options.runAgentCli ?? runAgentCli;
  const result = await cli(argv, { env: options.env });
  return jsonResult(id, {
    content: [{ text: safeJson(result.output, options), type: 'text' }],
    isError: result.status !== 0
  });
}

function requireArgs(args, names, build) {
  for (const name of names) {
    if (typeof args[name] !== 'string' || args[name].length === 0) return { error: `missing_${name}`, ok: false };
  }
  return { argv: build(), ok: true };
}

function searchArgv(args) {
  const argv = ['materials/search', '--query', args.query];
  if (args.limit !== undefined) argv.push('--limit', String(args.limit));
  return argv;
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
