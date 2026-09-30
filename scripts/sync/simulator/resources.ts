import { expect } from 'vitest';

import { importImageAttachmentResource } from '../../../electron/attachments/importImageAttachmentResource.js';

import { assertResources, assertBody } from './assertions.js';
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
  expect(ctx.sa.requests.some((url) => url.startsWith('/companion/content-blobs'))).toBe(true);
  expect(ctx.sa.requests.some((url) => url.startsWith('/companion/attachment-resource'))).toBe(true);
  await converge(ctx);
}
