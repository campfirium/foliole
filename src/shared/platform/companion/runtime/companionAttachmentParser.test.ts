// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';

import { createCompanionAttachmentParser } from './companionAttachmentParser';
import { installCompanionAttachmentTestWorker } from './companionAttachmentWorker.testSupport';

let worker: Awaited<ReturnType<typeof installCompanionAttachmentTestWorker>>;
beforeEach(async () => { worker = await installCompanionAttachmentTestWorker(); });
afterEach(() => worker.close());

it('reuses a worker for bounded requests, reports parser errors, and terminates pending work on abort', async () => {
  const controller = new AbortController();
  const parser = createCompanionAttachmentParser(controller.signal);
  const row = { id: 'a', content: 'Body', body_hash: hashTextBody('Body'), resources_json: '[]' };
  try {
    expect(await parser.parse([row])).toEqual([{ id: 'a', body_hash: row.body_hash, resources_json: '[]', storageKeys: [] }]);
    await expect(parser.parse([{ ...row, body_hash: null }])).rejects.toThrow('body_unreadable');
    const pending = parser.parse([row]);
    controller.abort(new Error('user_active'));
    await expect(pending).rejects.toThrow('user_active');
    await expect(parser.parse([row])).rejects.toThrow('parser_closed');
  } finally { parser.close(); }
});

it('fails explicitly when workers are unavailable instead of parsing on the UI thread', () => {
  vi.stubGlobal('Worker', class { constructor() { throw new Error('worker_unavailable'); } });
  expect(() => createCompanionAttachmentParser()).toThrow('worker_unavailable');
});
