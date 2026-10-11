// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { cleanAbandonedRequestSyncFiles } from './requestSyncTemporaryCleanup.js';

it('removes abandoned requests once per connection while preserving security and business files', async () => {
  const parent = path.resolve('.tmp/artifacts');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'request-cleanup-'));
  try {
    const requests = path.join(root, 'SyncTransport/requests');
    await mkdir(requests, { recursive: true });
    await mkdir(path.join(root, 'database'));
    await writeFile(path.join(requests, 'abandoned'), 'partial');
    await writeFile(path.join(root, 'SyncTransport/security'), 'nonce');
    await writeFile(path.join(root, 'database/main.db'), 'business');
    const connection = { dbPath: path.join(root, 'database/main.db') };
    cleanAbandonedRequestSyncFiles(connection);
    await expect(readFile(path.join(requests, 'abandoned'))).rejects.toMatchObject({ code: 'ENOENT' });
    await mkdir(requests);
    await writeFile(path.join(requests, 'active'), 'in-flight');
    cleanAbandonedRequestSyncFiles(connection);
    expect(await readFile(path.join(requests, 'active'), 'utf8')).toBe('in-flight');
    expect(await readFile(path.join(root, 'SyncTransport/security'), 'utf8')).toBe('nonce');
    expect(await readFile(connection.dbPath, 'utf8')).toBe('business');
  } finally { await rm(root, { force: true, recursive: true }); }
});
