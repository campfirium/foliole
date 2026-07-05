import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

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

test('desktop runtime exposes the local Agent Control API foundation', async ({ desktopApp }) => {
  const userDataPath = await desktopApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  const descriptor = await readDescriptor(descriptorPath);
  const endpoint = String(descriptor.endpoint);
  const token = String(descriptor.token);

  expect(endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(token.length).toBeGreaterThan(20);
  expect(descriptor).toMatchObject({
    capabilities: [
      'materials.read',
      'materials.search',
      'virtualFolders.write',
      'materials.update',
      'materials.deleteSoft'
    ],
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
  expect(await responseJson(capabilities)).toEqual({
    capabilities: [
      { enabled: false, name: 'materials.read' },
      { enabled: false, name: 'materials.search' },
      { enabled: false, name: 'virtualFolders.write' },
      { enabled: false, name: 'materials.update' },
      { enabled: false, name: 'materials.deleteSoft' }
    ],
    protocol_version: 1
  });
});
