/* global process */

import { readFile } from 'node:fs/promises';

export async function readAgentTrace(flags, options = {}) {
  const tracePath = flags.trace_path ?? options.env?.FOLIOLE_AGENT_MCP_TRACE_PATH ?? process.env.FOLIOLE_AGENT_MCP_TRACE_PATH;
  if (!tracePath) return failure('trace_path_not_found', 2);
  const limit = normalizeTraceLimit(flags.limit);
  try {
    const text = await readFile(tracePath, 'utf8');
    const events = text.trim().split(/\r?\n/u).filter(Boolean).map(parseTraceLine).filter(Boolean).slice(-limit);
    return { output: { count: events.length, events, trace_path: tracePath }, status: 0 };
  } catch {
    return { output: { count: 0, events: [], missing: true, trace_path: tracePath }, status: 0 };
  }
}

function normalizeTraceLimit(value) {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 20;
}

function parseTraceLine(line) {
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== 'object') return null;
    return {
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
      ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
      ...(typeof value.tool === 'string' ? { tool: value.tool } : {}),
      status: value.status === 'error' ? 'error' : 'ok'
    };
  } catch {
    return null;
  }
}

function failure(error, status) {
  return { output: { error }, status };
}
