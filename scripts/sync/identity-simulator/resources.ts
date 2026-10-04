import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import { importImageAttachmentResource } from '../../../electron/attachments/importImageAttachmentResource.js';

import { assertResources, assertBody, assertCompleted } from './assertions.js';
import { snapshotInput } from './input.js';
import { edit } from './operations.js';
import { converge, type ScenarioContext } from './scenarios.js';
import { inPeer } from './scope.js';
import { pull } from './transport.js';

export async function resources(ctx: ScenarioContext) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLs8AAAAASUVORK5CYII=', 'base64');
  const imported = await inPeer(ctx.a, () => importImageAttachmentResource({ bytes: png,
    mimeType: 'image/png', originalName: 'pixel.png', errorSource: 'simulator' }));
  expect(imported.status).toBe('imported');
  if (imported.status !== 'imported') throw new Error('simulator_attachment_import_failed');
  const body = `![pixel](asset://${imported.storage_key})`;
  edit(ctx.a, body);
  ctx.sa.interrupt = { path: '/companion/attachment-resource', remaining: 1 };
  await expect(pull(ctx.sa, ctx.b)).rejects.toThrow();
  expect(ctx.sa.interrupt).toBeNull();
  await pull(ctx.sa, ctx.b);
  assertBody(ctx.b, body);
  await assertResources(ctx.a, ctx.b);
  expect(ctx.sa.requests.some((url) => url.startsWith('/companion/content-blobs'))).toBe(false);
  expect(ctx.sa.requests.some((url) => url.startsWith('/companion/attachment-resource'))).toBe(true);
  await converge(ctx);
}

export async function mismatchedResourceType(ctx: ScenarioContext) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLs8AAAAASUVORK5CYII=', 'base64');
  const imported = await inPeer(ctx.a, () => importImageAttachmentResource({ bytes: png,
    mimeType: 'image/png', originalName: 'pixel.png', errorSource: 'simulator' }));
  if (imported.status !== 'imported') throw new Error('simulator_attachment_import_failed');
  const key = imported.storage_key.replace(/\.png$/, '.jpg');
  await fs.writeFile(path.join(ctx.a.assets, key), png);
  edit(ctx.a, `![legacy](asset://${key})`);
  edit(ctx.a, 'unrelated body', 'resource-free');
  const input = await snapshotInput(ctx.a.dbPath, ctx.a.assets, path.join(ctx.a.root, 'type-evidence'));
  expect(input.resourceIssues).toEqual([{ key, error: 'Error: input_resource_type_mismatch' }]);
  expect(await fs.readFile(path.join(input.destination, 'assets', key))).toEqual(png);
  const missingKeys = new Set([key]);
  await converge({ ...ctx, missingKeys });
  await assertResources(ctx.a, ctx.b, missingKeys);
  await assertCompleted(ctx.b, missingKeys);
  assertBody(ctx.b, 'unrelated body', 'resource-free');
  expect(ctx.b.sqlite.prepare('SELECT article_id FROM sync_pack_resource_articles').pluck().all()).toContain('topic');
}
