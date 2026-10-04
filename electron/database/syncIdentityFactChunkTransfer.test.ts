// @vitest-environment node
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { SyncIdentityFactTransfer } from '../../lib/core/sync/syncIdentityFactTransfer.js';

import { createFactTransferFixture } from './syncIdentityFactTransfer.testSupport.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
setupSyncPackBuilderTestLifecycle();

it('persists byte chunks across restart and duplicate delivery, then adopts a giant current body exactly', async () => {
  const body = '中😀'.repeat(460_000);
  const fixture = await createFactTransferFixture(1, body);
  try {
    let after: string | null = null;
    let chunk: SyncIdentityFactTransfer['chunk'];
    let chunks = 0;
    do {
      const pack = await fixture.build('versions', after, chunk);
      expect(pack.measured.transferBytes).toBeLessThanOrEqual(1024 * 1024);
      await fixture.apply(pack);
      if (pack.manifest.fact_chunk) {
        chunks++;
        if (pack.manifest.fact_tail?.chunk) {
          expect(fixture.receiver.prepare("SELECT typeof(row_json) AS type, length(row_json) AS bytes FROM sync_identity_fact_staging WHERE fact_key = 'history-0139'").get())
            .toEqual({ type: 'blob', bytes: pack.manifest.fact_tail.chunk.nextOffset });
          expect(fixture.receiver.prepare("SELECT complete FROM sync_identity_fact_sections WHERE section = 'versions'").get()).toEqual({ complete: 0 });
          fixture.restart();
          const rebuilt = await fixture.build('versions', after, chunk);
          expect(rebuilt.page.page_id).toBe(pack.page.page_id);
          await fixture.apply(rebuilt);
          expect(fixture.receiver.prepare("SELECT length(row_json) AS bytes FROM sync_identity_fact_staging WHERE fact_key = 'history-0139'").get()).toEqual({ bytes: pack.manifest.fact_tail.chunk.nextOffset });
          const changed = await fixture.build('versions', after, chunk);
          await expect(fixture.apply(changed, (incoming) => {
            const row = incoming.prepare("SELECT value FROM pack_manifest WHERE key = 'fact_chunk'").get() as { value: string };
            const payload = JSON.parse(row.value) as { data_base64: string };
            payload.data_base64 = `${payload.data_base64[0] === 'A' ? 'B' : 'A'}${payload.data_base64.slice(1)}`;
            incoming.prepare("UPDATE pack_manifest SET value = ? WHERE key = 'fact_chunk'").run(JSON.stringify(payload));
          })).rejects.toThrow('sync_identity_fact_replay_mismatch');
        }
      }
      fixture.advance(pack);
      after = pack.manifest.fact_tail?.nextAfter ?? null;
      const tail = pack.manifest.fact_tail?.chunk;
      chunk = tail ? { key: tail.key, offset: tail.nextOffset, total: tail.total } : undefined;
    } while (after !== null || chunk);
    expect(chunks).toBeGreaterThan(12);
    expect(fixture.receiver.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
    await fixture.transfer('parents');
    await fixture.transfer('reviews');
    await fixture.apply(await fixture.build('head'));
    expect(fixture.receiver.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'history-0139'").get()).toEqual({ body_text: body });
    expect(fixture.receiver.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").get()).toEqual({ current_version_id: 'history-0139' });
  } finally { fixture.close(); }
}, 120_000);
