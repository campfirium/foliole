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

it('starts Codex app-server without Foliole MCP registration', () => {
  expect(buildCodexAppServerArgs()).toEqual(['app-server']);
});

it('asks the online smoke turn to discover the stable CLI without internal tool names', () => {
  expect(createSmokePrompt()).not.toContain('foliole_materials_read');
  expect(createSmokePrompt()).not.toContain('MCP');
  expect(createSmokePrompt()).toContain('foliole help --json');
  expect(createSmokePrompt()).toContain('smoke-topic');
  expect(createSmokePrompt()).toContain('TRACE_SMOKE_OK Aide CLI Smoke Topic');
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

it('requires both the CLI-backed API read and expected assistant answer for success', () => {
  const apiRequests = [{
    authorization: 'Bearer smoke-token',
    body: { id: 'smoke-topic' },
    method: 'POST',
    url: '/agent-control/v1/materials/read'
  }];

  expect(isOnlineSmokeSuccessful('TRACE_SMOKE_OK Aide CLI Smoke Topic', apiRequests)).toBe(true);
  expect(isOnlineSmokeSuccessful('I read it.', apiRequests)).toBe(false);
  expect(isOnlineSmokeSuccessful('TRACE_SMOKE_OK Aide CLI Smoke Topic', [])).toBe(false);
});

it('exposes the online smoke as a package script', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  expect(packageJson.scripts['aide:online-smoke']).toBe(
    'node scripts/agent-control/foliole-aide-online-smoke.mjs'
  );
});
