import fs from 'node:fs/promises';
import path from 'node:path';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';

import { expect, test } from './harness/fixtures';

const EXPECTED_DESCRIPTOR_CAPABILITIES = [
  'materials.read',
  'materials.search',
  'materials.listChildren',
  'materials.create',
  'materials.move',
  'materials.reorder',
  'materials.restore',
  'virtualFolders.list',
  'virtualFolders.read',
  'virtualFolders.create',
  'virtualFolders.addItems',
  'virtualFolders.removeItems',
  'virtualFolders.reorder',
  'virtualFolders.update',
  'virtualFolders.deleteSoft',
  'virtualFolders.restore',
  'materials.update',
  'materials.deleteSoft'
];

const EXPECTED_CAPABILITY_STATUSES = EXPECTED_DESCRIPTOR_CAPABILITIES.map((name) => ({
  enabled: true,
  name
}));

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
}

async function readDescriptor(filePath: string) {
  await expect.poll(async () => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }, { timeout: 5000 }).toBe(true);
  return readJson(filePath);
}

async function responseJson(response: Response) {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function expectWithoutToken(value: unknown, token: string) {
  expect(JSON.stringify(value)).not.toContain(token);
}

function expectRuntimeIdentity(value: unknown) {
  expect(value).toMatchObject({
    boot_id: expect.any(String),
    pid: expect.any(Number),
    started_at: expect.any(String)
  });
  expect(value && typeof value === 'object' && 'database_device_id_hash' in value).toBe(true);
}

function expectCapabilitiesPayload(value: unknown) {
  expect(value).toMatchObject({
    capabilities: EXPECTED_CAPABILITY_STATUSES,
    protocol_version: 1
  });
  expectRuntimeIdentity((value as { runtime_identity?: unknown })?.runtime_identity);
}

async function expectMaterialApiRoutes(endpoint: string, token: string) {
  const emptySearch = await fetch(`${endpoint}/agent-control/v1/materials/search`, {
    body: JSON.stringify({ query: '   ' }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST'
  });
  expect(emptySearch.status).toBe(400);
  expect(await responseJson(emptySearch)).toEqual({ error: 'invalid_request' });

  const missingMaterial = await fetch(`${endpoint}/agent-control/v1/materials/read`, {
    body: JSON.stringify({ id: 'missing-hidden-native-material' }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST'
  });
  expect(missingMaterial.status).toBe(404);
  expect(await responseJson(missingMaterial)).toEqual({ error: 'not_found' });

  const topLevelMaterials = await fetch(`${endpoint}/agent-control/v1/materials/list-children`, {
    body: JSON.stringify({ limit: 5 }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST'
  });
  expect(topLevelMaterials.status).toBe(200);
  expect(await responseJson(topLevelMaterials)).toMatchObject({
    children: expect.any(Array),
    limit: 5,
    parent_id: null
  });
}

async function expectCliRoutes(descriptorPath: string, token: string) {
  const cliHealth = await runAgentCli(['health', '--descriptor', descriptorPath]);
  expect(cliHealth.status).toBe(0);
  expect(cliHealth.output).toMatchObject({ ok: true, service: 'foliole-agent-control' });
  expectWithoutToken(cliHealth.output, token);

  const cliCapabilities = await runAgentCli(['capabilities', '--descriptor', descriptorPath]);
  expect(cliCapabilities.status).toBe(0);
  expectCapabilitiesPayload(cliCapabilities.output);
  expectWithoutToken(cliCapabilities.output, token);

  const cliEmptySearch = await runAgentCli(['materials/search', '--descriptor', descriptorPath, '--query', '   ']);
  expect(cliEmptySearch).toEqual({ output: { error: 'invalid_request' }, status: 1 });
  expectWithoutToken(cliEmptySearch.output, token);

  const cliTopLevelMaterials = await runAgentCli(['materials/list-children', '--descriptor', descriptorPath, '--limit', '5']);
  expect(cliTopLevelMaterials.status).toBe(0);
  expect(cliTopLevelMaterials.output).toMatchObject({ children: expect.any(Array), limit: 5, parent_id: null });
  expectWithoutToken(cliTopLevelMaterials.output, token);
}

test('desktop runtime exposes the local Agent Control API foundation', async ({ desktopApp }) => {
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const descriptor = await readDescriptor(descriptorPath);
  const endpoint = String(descriptor.endpoint);
  const token = String(descriptor.token);

  expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(token.length).toBeGreaterThan(20);
  expect(descriptor).toMatchObject({
    capabilities: EXPECTED_DESCRIPTOR_CAPABILITIES,
    protocol_version: 1
  });

  const health = await fetch(`${endpoint}/agent-control/v1/health`);
  expect(health.status).toBe(200);
  expect(await responseJson(health)).toMatchObject({
    ok: true,
    protocol_version: 1,
    service: 'foliole-agent-control'
  });

  const unauthorized = await fetch(`${endpoint}/agent-control/v1/capabilities`);
  expect(unauthorized.status).toBe(401);

  const capabilities = await fetch(`${endpoint}/agent-control/v1/capabilities`, {
    headers: { authorization: `Bearer ${token}` }
  });
  expect(capabilities.status).toBe(200);
  const capabilitiesPayload = await responseJson(capabilities);
  expectCapabilitiesPayload(capabilitiesPayload);

  await expectMaterialApiRoutes(endpoint, token);
  await expectCliRoutes(descriptorPath, token);
});
