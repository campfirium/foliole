// @vitest-environment node
import { expect, it } from 'vitest';

import { parseChangedAttachmentArticles } from '../../lib/core/sync/attachmentDemandPreparation.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { withRequestSyncAttachmentPreparation } from '../../lib/core/sync/requestSyncAttachmentPreparation.js';

import { demandFixture, imageBody, imageKey } from './attachmentDemandQueue.testSupport.js';
import { deferred } from './attachmentPreparationHttp.testSupport.js';

it.each(['body-null-hash', 'body-same-hash', 'version', 'mount', 'delete', 'permanent-delete', 'queue-consumed'])(
  'rejects a candidate changed after its snapshot: %s, preserving the queued current input', async change => {
    const f = demandFixture();
    try {
      f.insert('article');
      if (change === 'body-same-hash') f.sqlite.exec("UPDATE nodes SET body_blob_hash = 'hash'");
      let snapshot = false;
      const host = { ...f.host, readSnapshot: async <T>(read: (db: DbPort) => Promise<T>) => {
        const result = await f.host.readSnapshot(read);
        if (!snapshot) {
          snapshot = true;
          if (change.startsWith('body-')) f.sqlite.prepare('UPDATE nodes SET content = ?').run(imageBody(imageKey(2)));
          if (change === 'version') f.sqlite.exec("UPDATE nodes SET current_version_id = 'new-version'");
          if (change === 'mount') f.sqlite.prepare('UPDATE nodes SET resource_references = ?')
            .run(JSON.stringify([{ role: 'reference', storage_key: imageKey(3), original_name: null }]));
          if (change === 'delete') f.sqlite.exec("UPDATE nodes SET deleted_at = 'now'");
          if (change === 'permanent-delete') f.sqlite.exec('DELETE FROM nodes');
          if (change === 'queue-consumed') f.sqlite.exec('DELETE FROM attachment_parse_queue');
        }
        return result;
      } };
      await parseChangedAttachmentArticles(host, () => false);
      expect(f.pending()).toEqual([]);
      expect(f.queued()).toEqual(change === 'queue-consumed' ? [] : ['article']);
      await parseChangedAttachmentArticles(f.host, () => false);
      expect(f.queued()).toEqual([]);
      if (change.startsWith('body-')) expect(f.pending()).toEqual([imageKey(2)]);
      if (change === 'delete' || change === 'permanent-delete') expect(f.pending()).toEqual([]);
    } finally { f.sqlite.close(); }
  });

it.each(['before-read', 'after-snapshot', 'queued-write', 'during-write'])(
  'cancels at %s without consuming durable demand', async boundary => {
    const f = demandFixture();
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort(new Error('test_cancelled'));
    try {
      f.insert('article');
      if (boundary === 'before-read') cancel();
      const host = { ...f.host,
        readSnapshot: async <T>(read: (db: DbPort) => Promise<T>) => {
          const result = await f.host.readSnapshot(read);
          if (boundary === 'after-snapshot') cancel();
          return result;
        },
        write: <T>(write: (db: DbPort) => Promise<T>) => {
          if (boundary === 'queued-write') cancel();
          return f.host.write(db => write({ ...db, transaction: execute => db.transaction(tx => execute({ ...tx,
            run: async (sql, params) => {
              const value = await tx.run(sql, params);
              if (boundary === 'during-write') cancel();
              return value;
            }
          })) }));
        }
      };
      await expect(parseChangedAttachmentArticles(host, () => false, undefined, cancellation.signal)).rejects.toThrow('test_cancelled');
      expect(f.pending()).toEqual([]); expect(f.queued()).toEqual(['article']);
    } finally { f.sqlite.close(); }
  });

it('keeps the parse task when writing demand fails and reports the error through its lifecycle', async () => {
  const f = demandFixture();
  try {
    f.insert('article');
    f.sqlite.exec("CREATE TRIGGER fail_demand BEFORE INSERT ON attachment_pending BEGIN SELECT RAISE(ABORT, 'demand_failed'); END");
    await expect(withRequestSyncAttachmentPreparation({ ...f.host, files: {} as never }, undefined, async host => {
      host.attachmentArticlesCommitted!(['article']);
    })).rejects.toThrow('demand_failed');
    expect(f.queued()).toEqual(['article']); expect(f.pending()).toEqual([]);
    f.sqlite.exec('DROP TRIGGER fail_demand');
    await parseChangedAttachmentArticles(f.host, () => false);
    expect(f.pending()).toEqual([imageKey(1)]);
  } finally { f.sqlite.close(); }
});

it('cancels and joins a started preparation when the data lifecycle fails', async () => {
  const f = demandFixture();
  const release = deferred(); const started = deferred();
  try {
    f.insert('article');
    const host = { ...f.host, files: {} as never, readSnapshot: async <T>(read: (db: DbPort) => Promise<T>) => {
      const result = await f.host.readSnapshot(read);
      started.resolve(); await release.promise; return result;
    } };
    const work = withRequestSyncAttachmentPreparation(host, undefined, async prepared => {
      prepared.attachmentArticlesCommitted!(['article']);
      await started.promise;
      release.resolve(); throw new Error('data_failed');
    });
    await expect(work).rejects.toThrow('data_failed');
    expect(f.pending()).toEqual([]); expect(f.queued()).toEqual(['article']);
  } finally { release.resolve(); f.sqlite.close(); }
});

it('deduplicates committed candidates while leaving unchanged historical articles queued', async () => {
  const f = demandFixture();
  try {
    f.insert('historical', imageBody(imageKey(1))); f.insert('changed', imageBody(imageKey(2)));
    await withRequestSyncAttachmentPreparation({ ...f.host, files: {} as never }, undefined, async host => {
      host.attachmentArticlesCommitted!([]);
      host.attachmentArticlesCommitted!(['changed', 'changed']);
      host.attachmentArticlesCommitted!(['changed']);
    });
    expect(f.pending()).toEqual([imageKey(2)]); expect(f.queued()).toEqual(['historical']);
    await parseChangedAttachmentArticles(f.host, () => false);
    expect(f.pending()).toEqual([imageKey(1), imageKey(2)]);
  } finally { f.sqlite.close(); }
});

it('cancels an inbound preparation when its request disconnects while the round lease is still active', async () => {
  const { withInboundAttachmentPreparation } = await import('../../lib/core/sync/requestSyncInboundAttachmentPreparation.js');
  const f = demandFixture();
  const release = deferred(); const started = deferred();
  const lifecycle = new AbortController(); const request = new AbortController();
  try {
    f.insert('article');
    const host = { ...f.host, files: {} as never, readSnapshot: async <T>(read: (db: DbPort) => Promise<T>) => {
      const result = await f.host.readSnapshot(read);
      started.resolve(); await release.promise; return result;
    } };
    await expect(withInboundAttachmentPreparation(host, {
      lifecycle: lifecycle.signal, signal: request.signal, mode: 'objects', single: false
    }, async prepared => {
      prepared.attachmentArticlesCommitted!(['article']);
      await started.promise;
      request.abort(new Error('disconnected'));
      release.resolve();
    })).rejects.toThrow('disconnected');
    expect(lifecycle.signal.aborted).toBe(false);
    expect(f.pending()).toEqual([]); expect(f.queued()).toEqual(['article']);
  } finally { release.resolve(); lifecycle.abort(); f.sqlite.close(); }
});

it('does not parse an unchanged body when a version-only commit meets historical queued work', async () => {
  const { trackCommittedAttachmentArticles } = await import('../../lib/core/sync/requestSyncAttachmentPreparation.js');
  const f = demandFixture();
  try {
    f.insert('article');
    await withRequestSyncAttachmentPreparation({ ...f.host, files: {} as never }, undefined, async host => {
      const committed = await f.port.transaction(db => trackCommittedAttachmentArticles(db, host, ['article'],
        () => db.run("UPDATE nodes SET current_version_id = 'title-only', title = 'New title'")));
      expect(committed.changed).toEqual([]);
      host.attachmentArticlesCommitted!(committed.changed);
    });
    expect(f.pending()).toEqual([]); expect(f.queued()).toEqual(['article']);
  } finally { f.sqlite.close(); }
});
