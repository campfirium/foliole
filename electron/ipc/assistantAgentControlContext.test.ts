// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const agentControlStatus = vi.hoisted(() => ({
  value: {
    endpoint: null as null | string,
    last_error: null as null | string,
    port: null as null | number,
    state: 'stopped' as 'failed' | 'running' | 'stopped'
  }
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: 'C:\\Foliole\\cache',
    app_config_dir: 'C:\\Foliole\\config',
    app_data_dir: 'C:\\Foliole',
    app_log_dir: 'C:\\Foliole\\logs'
  })
}));

vi.mock('../agentControl/agentControlServer.js', () => ({
  getAgentControlApiServerStatus: () => agentControlStatus.value,
  getAgentControlSessionDescriptorPath: () => 'C:\\Foliole\\cache\\agent-control-session.json'
}));

import {
  resolveAssistantAgentControlContext,
  resolveAssistantAppServerArgs
} from './assistantAgentControlContext.js';

beforeEach(() => {
  agentControlStatus.value = { endpoint: null, last_error: null, port: null, state: 'stopped' };
});

it('builds Codex app-server MCP config overrides for Foliole Agent Control', () => {
  const args = resolveAssistantAppServerArgs({
    FOLIOLE_AGENT_CONTROL_MCP_SERVER: 'D:\\C\\foliole\\scripts\\agent-control\\foliole-mcp-server.mjs',
    FOLIOLE_AGENT_DESCRIPTOR: 'C:\\Foliole\\cache\\agent-control-session.json'
  });

  expect(args).toEqual([
    '-c',
    'mcp_servers.foliole_agent_control.command="node"',
    '-c',
    "mcp_servers.foliole_agent_control.args=['D:\\C\\foliole\\scripts\\agent-control\\foliole-mcp-server.mjs','--descriptor','C:\\Foliole\\cache\\agent-control-session.json']"
  ]);
});

it('falls back to the repository MCP script path and runtime descriptor path', () => {
  const args = resolveAssistantAppServerArgs({});

  expect(args.join(' ')).toContain('mcp_servers.foliole_agent_control.args=');
  expect(args.join(' ')).toContain(`'${path.resolve(
    process.cwd(),
    'scripts',
    'agent-control',
    'foliole-mcp-server.mjs'
  )}'`);
  expect(args.join(' ')).toContain("'C:\\Foliole\\cache\\agent-control-session.json'");
});

it('can resolve the MCP script path from an app resources root', () => {
  const args = resolveAssistantAppServerArgs({
    FOLIOLE_AGENT_DESCRIPTOR: 'C:\\Foliole\\cache\\agent-control-session.json'
  }, 'C:\\Program Files\\Foliole\\resources');

  expect(args.join(' ')).toContain(`'${path.resolve(
    'C:\\Program Files\\Foliole\\resources',
    'scripts',
    'agent-control',
    'foliole-mcp-server.mjs'
  )}'`);
});

it('summarizes Agent Control MCP trace without exposing tool payloads', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-agent-trace-'));
  const tracePath = path.join(tempRoot, 'agent-control-mcp-trace.jsonl');
  fs.writeFileSync(tracePath, [
    JSON.stringify({ status: 'ok', timestamp: '2026-07-09T01:00:00.000Z', tool: 'foliole_health' }),
    JSON.stringify({
      error: 'missing_id',
      payload: { id: 'secret-topic' },
      status: 'error',
      timestamp: '2026-07-09T01:01:00.000Z',
      tool: 'foliole_materials_read'
    })
  ].join('\n'));

  try {
    expect(resolveAssistantAgentControlContext({
      FOLIOLE_AGENT_DESCRIPTOR: path.join(tempRoot, 'agent-control-session.json'),
      FOLIOLE_AGENT_MCP_TRACE_PATH: tracePath
    }).trace).toEqual({
      count: 2,
      lastError: 'missing_id',
      lastStatus: 'error',
      lastTimestamp: '2026-07-09T01:01:00.000Z',
      lastTool: 'foliole_materials_read'
    });
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
});

it('exposes the Agent Control startup error in the assistant context', () => {
  agentControlStatus.value = {
    endpoint: null,
    last_error: 'listen EADDRINUSE 127.0.0.1:5000',
    port: null,
    state: 'failed'
  };

  expect(resolveAssistantAgentControlContext({})).toMatchObject({
    lastError: 'listen EADDRINUSE 127.0.0.1:5000',
    state: 'failed'
  });
});
