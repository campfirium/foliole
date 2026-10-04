import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import { importImageAttachmentResource } from '../../../electron/attachments/importImageAttachmentResource.js';

import { assertBody, assertResources, graph } from './assertions.js';
import { snapshotInput } from './input.js';
import { edit } from './operations.js';
import { reopenPeer } from './peers.js';
import { converge, type ScenarioContext } from './scenarios.js';
import { inPeer } from './scope.js';
import { pull } from './transport.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLs8AAAAASUVORK5CYII=', 'base64');

async function importResourceKeys(ctx: ScenarioContext) {
  const keys: string[] = [];
  for (let index = 0; index < 101; index++) {
    const result = await inPeer(ctx.a, () => importImageAttachmentResource({
      bytes: Buffer.concat([png, Buffer.from(String(index))]), mimeType: 'image/png',
      originalName: `image-${index}.png`, errorSource: 'simulator' }));
    if (result.status !== 'imported') throw new Error('simulator_attachment_import_failed');
    keys.push(result.storage_key);
  }
  return keys;
}

export async function resourceRecovery(ctx: ScenarioContext) {
  const imported = await importResourceKeys(ctx);
  const keys = imported.slice(0, 100);
  const obsolete = imported[100]!;
  edit(ctx.a, `![historical image](asset://${obsolete})`);
  const body = keys.map((key, index) => `![image-${index}](asset://${key})`).join('\n');
  edit(ctx.a, body);
  await fs.rm(path.join(ctx.a.assets, obsolete));
  const missing = keys[99]!;
  const missingPath = path.join(ctx.a.assets, missing);
  const bytes = await fs.readFile(missingPath);
  await fs.rm(missingPath);
  const existingPath = path.join(ctx.b.assets, keys[0]!);
  await fs.copyFile(path.join(ctx.a.assets, keys[0]!), existingPath);
  const existing = await fs.stat(existingPath);
  const sourceBefore = graph(ctx.a);
  const input = await snapshotInput(ctx.a.dbPath, ctx.a.assets, path.join(ctx.a.root, 'resource-snapshot'));
  expect(graph(ctx.a)).toEqual(sourceBefore);
  expect(input.resourceNeeds).toHaveLength(100);
  expect(input.resourceIssues.map((issue) => issue.key)).toEqual([missing]);
  expect(await fs.readdir(path.join(input.destination, 'assets'))).toHaveLength(99);
  const missingKeys = new Set([missing]);
  await pull(ctx.sa, ctx.b, true, missingKeys);
  assertBody(ctx.b, body);
  await assertResources(ctx.a, ctx.b, missingKeys);
  expect(await fs.readdir(ctx.b.assets)).toHaveLength(99);
  expect((await fs.stat(existingPath)).mtimeMs).toBe(existing.mtimeMs);
  const pending = ctx.b.sqlite.prepare('SELECT * FROM sync_pack_resource_articles ORDER BY article_id').all();
  expect(pending).toHaveLength(1);
  const before = graph(ctx.b);
  reopenPeer(ctx.b);
  expect(ctx.b.sqlite.prepare('SELECT * FROM sync_pack_resource_articles ORDER BY article_id').all()).toEqual(pending);
  await fs.writeFile(missingPath, bytes);
  await pull(ctx.sa, ctx.b);
  expect(graph(ctx.b)).toEqual(before);
  expect(ctx.b.sqlite.prepare('SELECT * FROM sync_pack_resource_articles').all()).toEqual([]);
  expect(await fs.readdir(ctx.b.assets)).toHaveLength(100);
  await assertResources(ctx.a, ctx.b);
  await converge(ctx);
}
