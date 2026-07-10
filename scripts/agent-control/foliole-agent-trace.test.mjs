import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentCli } from './foliole-agent.mjs';

let tempRoot;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-agent-trace-'));
});

afterEach(async () => {
  await rm(tempRoot, { force: true, recursive: true });
});

describe('foliole agent trace cli', () => {
  it('reads recent MCP trace events without exposing extra fields', async () => {
    const tracePath = path.join(tempRoot, 'mcp-trace.jsonl');
    await writeFile(tracePath, [
      JSON.stringify({ raw_arguments: { id: 'secret-node' }, status: 'ok', timestamp: '2026-07-09T01:00:00.000Z', tool: 'foliole_health' }),
      JSON.stringify({ error: 'not_found', status: 'error', timestamp: '2026-07-09T01:01:00.000Z', tool: 'foliole_materials_read' }),
      '{broken'
    ].join('\n'));

    const result = await runAgentCli(['trace/read', '--trace-path', tracePath, '--limit', '1']);

    expect(result).toEqual({
      output: {
        count: 1,
        events: [{
          error: 'not_found',
          status: 'error',
          timestamp: '2026-07-09T01:01:00.000Z',
          tool: 'foliole_materials_read'
        }],
        trace_path: tracePath
      },
      status: 0
    });
    expect(JSON.stringify(result.output)).not.toContain('secret-node');
  });

  it('returns an empty diagnostic result when the trace file has not been created yet', async () => {
    const tracePath = path.join(tempRoot, 'missing-trace.jsonl');

    const result = await runAgentCli(['trace/read'], {
      env: { FOLIOLE_AGENT_MCP_TRACE_PATH: tracePath }
    });

    expect(result).toEqual({
      output: { count: 0, events: [], missing: true, trace_path: tracePath },
      status: 0
    });
  });
});
