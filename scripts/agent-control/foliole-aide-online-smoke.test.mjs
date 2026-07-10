import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

import {
  buildCodexAppServerArgs,
  classifyOnlineSmokeError,
  createSmokePrompt,
  createSmokeThreadStartParams,
  describeOnlineSmokeFailure
} from './foliole-aide-online-smoke.mjs';
import { isOnlineSmokeSuccessful } from './foliole-aide-online-smoke-success.mjs';

it('builds Codex app-server args with the Foliole MCP server descriptor', () => {
  const descriptorPath = 'C:\\Foliole\\cache\\agent-control-session.json';
  const tracePath = 'C:\\Foliole\\cache\\agent-control-mcp-trace.jsonl';
  const args = buildCodexAppServerArgs(descriptorPath, tracePath);

  expect(args).toEqual([
    'app-server',
    '-c',
    'mcp_servers.foliole_agent_control.command="node"',
    '-c',
    `mcp_servers.foliole_agent_control.args=['${path.resolve('scripts', 'agent-control', 'foliole-mcp-server.mjs')}','--descriptor','${descriptorPath}','--trace','${tracePath}']`
  ]);
});

it('asks the online smoke turn to use the material read MCP tool', () => {
  expect(createSmokePrompt()).toContain('foliole_materials_read');
  expect(createSmokePrompt()).toContain('smoke-topic');
  expect(createSmokePrompt()).toContain('TRACE_SMOKE_OK Aide MCP Smoke Topic');
});

it('keeps online smoke threads ephemeral and outside the repository', () => {
  const cwd = 'C:\\Users\\Tester\\AppData\\Local\\Temp\\foliole-aide-smoke';

  expect(createSmokeThreadStartParams(cwd)).toEqual({ cwd, ephemeral: true });
  expect(createSmokeThreadStartParams(cwd).cwd).not.toBe(path.resolve('.'));
});

it('classifies Codex app-server auth failures for actionable smoke output', () => {
  expect(classifyOnlineSmokeError(
    new Error('unexpected status 401 Unauthorized: Missing bearer or basic authentication in header')
  )).toBe('auth_failed');
  expect(classifyOnlineSmokeError(new Error('codex_app_server_timeout'))).toBe('timeout');
  expect(classifyOnlineSmokeError(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })))
    .toBe('not_configured');
});

it('describes App Server account failures without requiring CLI login', () => {
  expect(describeOnlineSmokeFailure('auth_failed')).toContain('authenticated account');
  expect(describeOnlineSmokeFailure('auth_failed')).not.toContain('sign in');
});

it('requires both the MCP trace and expected assistant answer for success', () => {
  const trace = [{ status: 'ok', tool: 'foliole_materials_read' }];
  const apiRequests = [{
    authorization: 'Bearer smoke-token',
    body: { id: 'smoke-topic' },
    method: 'POST',
    url: '/agent-control/v1/materials/read'
  }];

  expect(isOnlineSmokeSuccessful('TRACE_SMOKE_OK Aide MCP Smoke Topic', trace, apiRequests)).toBe(true);
  expect(isOnlineSmokeSuccessful('I read it.', trace, apiRequests)).toBe(false);
  expect(isOnlineSmokeSuccessful('TRACE_SMOKE_OK Aide MCP Smoke Topic', [], apiRequests)).toBe(false);
  expect(isOnlineSmokeSuccessful('TRACE_SMOKE_OK Aide MCP Smoke Topic', trace, [])).toBe(false);
});

it('exposes the online smoke as a package script', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  expect(packageJson.scripts['aide:online-smoke']).toBe(
    'node scripts/agent-control/foliole-aide-online-smoke.mjs'
  );
});
