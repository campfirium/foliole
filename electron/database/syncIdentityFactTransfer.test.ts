// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createFactTransferFixture } from './syncIdentityFactTransfer.testSupport.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));

setupSyncPackBuilderTestLifecycle();

it('transfers more than 4096 review facts without a total history cap', async () => {
  const fixture = await createFactTransferFixture(4097);
  try {
    for (const section of ['versions', 'parents', 'reviews'] as const) await fixture.transfer(section);
    const head = await fixture.build('head');
    expect(head.measured.applyRows).toBeLessThanOrEqual(128);
    await fixture.apply(head);
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get())
      .toEqual({ count: 4097 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get())
      .toEqual({ count: 141 });
  } finally { fixture.close(); }
}, 60_000);

it('accepts a rebuilt archive for the same original fact page without duplicating facts', async () => {
  const fixture = await createFactTransferFixture();
  try {
    const first = await fixture.build('versions');
    await fixture.apply(first);
    const rebuilt = await fixture.build('versions');
    expect(rebuilt.page.page_id).toBe(first.page.page_id);
    expect(rebuilt.manifest.pack_id).not.toBe(first.manifest.pack_id);
    await expect(fixture.apply(rebuilt)).resolves.toHaveProperty('applied');
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_staging').get())
      .toEqual({ count: 64 });
  } finally { fixture.close(); }
});

it('rejects a fact below the continuation cursor without persisting the page or advancing its receipt', async () => {
  const fixture = await createFactTransferFixture();
  try {
    const first = await fixture.build('versions');
    await fixture.apply(first);
    fixture.advance(first);
    const next = await fixture.build('versions', first.manifest.fact_tail?.nextAfter ?? null);
    await expect(fixture.apply(next, (incoming) => {
      incoming.prepare(`UPDATE node_sync_versions SET version_id = 'aaa-regressed'
        WHERE version_id = (SELECT min(version_id) FROM node_sync_versions)`).run();
    })).rejects.toThrow('sync_identity_fact_row_order_invalid');
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_staging').get())
      .toEqual({ count: 64 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
      .toEqual({ count: 1 });
  } finally { fixture.close(); }
});

it('keeps large original history outside business state through duplicate delivery and restart, then adopts its head', async () => {
  const fixture = await createFactTransferFixture();
  try {
    const first = await fixture.build('versions');
    expect(first.measured.applyRows).toBeLessThanOrEqual(128);
    expect(await fixture.apply(first)).toMatchObject({ applied: true });
    expect(await fixture.apply(first)).toMatchObject({ applied: false });
    fixture.advance(first);
    fixture.restart();
    expect(fixture.receiver.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
    const premature = await fixture.build('head');
    await expect(fixture.apply(premature)).rejects.toThrow('sync_identity_fact_sections_incomplete');
    let after = first.manifest.fact_tail?.nextAfter ?? null;
    while (after !== null) {
      const next = await fixture.build('versions', after);
      await fixture.apply(next);
      fixture.advance(next);
      after = next.manifest.fact_tail?.nextAfter ?? null;
    }
    await fixture.transfer('parents');
    await fixture.transfer('reviews');
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 0 });
    const head = await fixture.build('head');
    expect(head.measured.applyRows).toBeLessThanOrEqual(128);
    expect(await fixture.apply(head)).toMatchObject({ applied: true });
    expect(fixture.receiver.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").get())
      .toEqual({ current_version_id: 'history-0139' });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 141 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_version_parents').get()).toEqual({ count: 140 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 160 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_staging').get()).toEqual({ count: 0 });
    fixture.restart();
    expect(await fixture.apply(head)).toMatchObject({ applied: false });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 160 });
  } finally { fixture.close(); }
});

it('rolls back head adoption and its receipt if a staged original fact fails the sealed digest', async () => {
  const fixture = await createFactTransferFixture();
  try {
    for (const section of ['versions', 'parents', 'reviews'] as const) await fixture.transfer(section);
    const receipts = fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get();
    fixture.receiver.prepare(`UPDATE sync_identity_fact_staging SET row_json = json_set(row_json, '$.grade', 1)
      WHERE section = 'reviews' AND fact_key = 'review-0000'`).run();
    const head = await fixture.build('head');
    await expect(fixture.apply(head)).rejects.toThrow('sync_identity_fact_digest_mismatch');
    expect(fixture.receiver.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get()).toEqual(receipts);
    expect(fixture.receiver.prepare('SELECT COUNT(*) AS count FROM sync_identity_fact_sections').get()).toEqual({ count: 3 });
  } finally { fixture.close(); }
});
