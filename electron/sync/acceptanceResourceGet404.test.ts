import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  expireAvailableResourceForAcceptance, recordMissingResourceGetForAcceptance
} from './acceptanceResourceGet404.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

it('expires only the exact image inside an owned isolated library after an available claim', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 't203-resource-race-'));
  roots.push(root);
  const run = path.join(root, '.tmp/artifacts/a5-single-principal-sync-group/fixed-run');
  const library = path.join(run, 'macos-library');
  const assets = path.join(library, 'Assets');
  const evidence = path.join(run, 't203-ios-provider-failover');
  await fs.mkdir(assets, { recursive: true });
  await fs.mkdir(evidence);
  const bytes = Buffer.from('independent attachment bytes');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const image = path.join(assets, `${hash}.png`);
  await fs.writeFile(image, bytes);
  const env = { FOLIOLE_T203_RESOURCE_GET_404: '1',
    FOLIOLE_T203_RESOURCE_GET_404_HASH: hash,
    FOLIOLE_T203_RESOURCE_GET_404_LIBRARY: library,
    FOLIOLE_T203_RESOURCE_GET_404_EVIDENCE: evidence };
  await expireAvailableResourceForAcceptance(image, hash, bytes.length, env);
  await expect(fs.readFile(image)).resolves.toEqual(bytes);
  await fs.writeFile(path.join(evidence, 'arm-after-a5-presence'), 'armed');
  await expireAvailableResourceForAcceptance(image, 'f'.repeat(64), bytes.length, env);
  await expect(fs.readFile(image)).resolves.toEqual(bytes);
  await expireAvailableResourceForAcceptance(image, hash, bytes.length, env);
  await expect(fs.stat(image)).rejects.toMatchObject({ code: 'ENOENT' });
  const claim = JSON.parse(await fs.readFile(path.join(evidence, 'available-then-removed.json'), 'utf8'));
  expect(claim).toMatchObject({ claimedStatus: 'available', contentHash: hash,
    removedAfterHashCheck: true, sizeBytes: bytes.length });
  await recordMissingResourceGetForAcceptance(hash, hash, env);
  const request = JSON.parse(await fs.readFile(path.join(evidence, 'first-get-404.json'), 'utf8'));
  expect(request).toMatchObject({ attachmentId: hash, statusCode: 404, error: 'missing_file' });
});

it('rejects an acceptance fault targeting an ordinary library', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 't203-resource-guard-'));
  roots.push(root);
  const image = path.join(root, `${'a'.repeat(64)}.png`);
  await fs.writeFile(image, 'protected');
  await expect(expireAvailableResourceForAcceptance(image, 'a'.repeat(64), 9, {
    FOLIOLE_T203_RESOURCE_GET_404: '1', FOLIOLE_T203_RESOURCE_GET_404_HASH: 'a'.repeat(64),
    FOLIOLE_T203_RESOURCE_GET_404_LIBRARY: root,
    FOLIOLE_T203_RESOURCE_GET_404_EVIDENCE: path.join(root, 'evidence')
  })).rejects.toThrow('outside its isolated acceptance library');
  await expect(fs.readFile(image, 'utf8')).resolves.toBe('protected');
});
