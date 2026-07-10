import fs from 'node:fs';
import path from 'node:path';

import type {
  NativeAssistantAgentControlTraceSummary,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import { getEnabledAgentControlCapabilities } from '../agentControl/agentControlCapabilities.js';
import {
  getAgentControlApiServerStatus,
  getAgentControlSessionDescriptorPath
} from '../agentControl/agentControlServer.js';

export function resolveAssistantAgentDescriptorPath(env: NodeJS.ProcessEnv) {
  return env.FOLIOLE_AGENT_DESCRIPTOR?.trim() || getAgentControlSessionDescriptorPath();
}

export function resolveAssistantAgentControlMcpServerPath(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  return env.FOLIOLE_AGENT_CONTROL_MCP_SERVER?.trim() ||
    path.resolve(appRoot, 'scripts', 'agent-control', 'foliole-mcp-server.mjs');
}

export function resolveAssistantAgentControlCliPath(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  return env.FOLIOLE_AGENT_CONTROL_CLI?.trim() ||
    path.resolve(appRoot, 'scripts', 'agent-control', 'foliole-agent.mjs');
}

export function resolveAssistantAgentControlTracePath(env: NodeJS.ProcessEnv) {
  const explicit = env.FOLIOLE_AGENT_MCP_TRACE_PATH?.trim();
  if (explicit) return explicit;
  return path.join(path.dirname(resolveAssistantAgentDescriptorPath(env)), 'agent-control-mcp-trace.jsonl');
}

export function resolveAssistantAppServerArgs(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  const descriptorPath = resolveAssistantAgentDescriptorPath(env);
  const serverPath = resolveAssistantAgentControlMcpServerPath(env, appRoot);
  const tracePath = resolveAssistantAgentControlTracePath(env);
  return [
    '-c',
    'mcp_servers.foliole_agent_control.command="node"',
    '-c',
    `mcp_servers.foliole_agent_control.args=[${tomlString(serverPath)},'--descriptor',${tomlString(descriptorPath)},'--trace',${tomlString(tracePath)}]`
  ];
}

export function resolveAssistantAgentControlContext(env: NodeJS.ProcessEnv, appRoot = process.cwd()) {
  const status = getAgentControlApiServerStatus();
  const tracePath = resolveAssistantAgentControlTracePath(env);
  return {
    capabilities: getEnabledAgentControlCapabilities(),
    cliPath: resolveAssistantAgentControlCliPath(env, appRoot),
    descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR' as const,
    descriptorPath: resolveAssistantAgentDescriptorPath(env),
    ...(status.endpoint ? { endpoint: status.endpoint } : {}),
    ...(status.last_error?.trim() ? { lastError: status.last_error.trim().slice(0, 180) } : {}),
    state: status.state,
    trace: readAssistantAgentControlTraceSummary(tracePath),
    tracePath
  };
}

export function withAgentControlContext(
  context: NativeAssistantWorkspaceContext,
  env: NodeJS.ProcessEnv,
  appRoot = process.cwd()
): NativeAssistantWorkspaceContext {
  return {
    ...context,
    agentControl: resolveAssistantAgentControlContext(env, appRoot)
  };
}

function tomlString(value: string) {
  if (value.includes("'")) return JSON.stringify(value);
  return `'${value}'`;
}

function readAssistantAgentControlTraceSummary(tracePath: string): NativeAssistantAgentControlTraceSummary {
  try {
    const text = fs.readFileSync(tracePath, 'utf8');
    const events = text.trim().split(/\r?\n/u).filter(Boolean).map(parseTraceLine).filter(Boolean);
    const last = events[events.length - 1];
    return {
      count: events.length,
      ...(last?.error ? { lastError: last.error } : {}),
      ...(last?.status ? { lastStatus: last.status } : {}),
      ...(last?.timestamp ? { lastTimestamp: last.timestamp } : {}),
      ...(last?.tool ? { lastTool: last.tool } : {})
    };
  } catch {
    return { count: 0, missing: true };
  }
}

function parseTraceLine(line: string) {
  try {
    const value = JSON.parse(line) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return null;
    return {
      ...(value.status === 'error' ? { status: 'error' as const } : { status: 'ok' as const }),
      ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
      ...(typeof value.error === 'string' ? { error: value.error.slice(0, 180) } : {}),
      ...(typeof value.tool === 'string' ? { tool: value.tool } : {})
    };
  } catch {
    return null;
  }
}
