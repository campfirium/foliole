// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readRequestSyncAttachmentNeedsSlice as slice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';

import { demandFixture, imageBody, imageKey, observeDemandQueries } from './attachmentDemandQueue.testSupport.js';

const missing = async (keys: string[]) => keys.map(() => false);
const read = (f: ReturnType<typeof demandFixture>) => slice(f.host, missing, () => false);

it('parses the final adopted row once, ignores equal-value and title updates, replaces removed and restored references', async () => {
  const f = demandFixture();
  try {
    f.insert('article');
    const registered = f.sqlite.prepare('SELECT registered_at FROM attachment_parse_queue').pluck().get();
    for (let i = 1; i <= 10; i++) f.sqlite.prepare('UPDATE nodes SET content = ?').run(imageBody(imageKey(i)));
    expect(f.queued()).toEqual(['article']);
    expect(f.sqlite.prepare('SELECT registered_at FROM attachment_parse_queue').pluck().get()).toBe(registered);
    expect((await read(f)).keys).toEqual([imageKey(10)]);
    f.sqlite.exec("UPDATE nodes SET content = content, resource_references = resource_references, title = 'New'");
    expect(f.queued()).toEqual([]);
    f.sqlite.exec("UPDATE nodes SET content = ''");
    expect((await read(f)).keys).toEqual([]);
    expect(f.pending()).toEqual([]);
    f.sqlite.prepare('UPDATE nodes SET content = ?').run(imageBody(imageKey(1)));
    expect((await read(f)).keys).toEqual([imageKey(1)]);
    f.sqlite.exec("UPDATE nodes SET deleted_at = 'now'");
    await read(f); expect(f.pending()).toEqual([]);
    f.sqlite.exec('UPDATE nodes SET deleted_at = NULL');
    expect((await read(f)).keys).toEqual([imageKey(1)]);
    f.sqlite.exec('DELETE FROM nodes');
    await read(f); expect(f.pending()).toEqual([]); expect(f.queued()).toEqual([]);
  } finally { f.sqlite.close(); }
});

it('does no body or file work at rest, and leaves externally deleted attachments alone until content changes', async () => {
  const f = demandFixture();
  try {
    f.insert('article');
    await slice(f.host, async keys => keys.map(() => true), () => false);
    let bodies = 0; let stats = 0;
    const host = observeDemandQueries(f, sql => { if (sql.includes('JOIN nodes')) bodies++; });
    for (let i = 0; i < 3; i++) await slice(host, async keys => { stats += keys.length; return keys.map(() => false); }, () => false);
    expect({ bodies, stats }).toEqual({ bodies: 0, stats: 0 });
    f.sqlite.prepare('UPDATE nodes SET content = content || ?').run(' edited');
    expect((await read(f)).keys).toEqual([imageKey(1)]);
  } finally { f.sqlite.close(); }
});

it('updates mount and body demand independently and waits for PDF text', async () => {
  const f = demandFixture();
  const pdf = imageKey(2).replace('.png', '.pdf');
  try {
    f.insert('article'); await read(f);
    expect(() => f.sqlite.exec('UPDATE nodes SET content = NULL')).toThrow('NOT NULL');
    f.sqlite.prepare('UPDATE nodes SET resource_references = ?')
      .run(JSON.stringify([{ role: 'reference', storage_key: pdf, original_name: null }]));
    expect(new Set((await read(f)).keys)).toEqual(new Set([imageKey(1), pdf]));
    f.sqlite.prepare('UPDATE nodes SET content = ?').run(imageBody(imageKey(4)));
    expect(new Set((await read(f)).keys)).toEqual(new Set([pdf, imageKey(4)]));
    expect(f.queued()).toEqual([]);
    const result = await slice(f.host, async keys => keys.map(() => true), () => false, true);
    expect(result.pdfTextKeys).toEqual([pdf]); expect(f.pending()).toEqual([pdf]);
    f.sqlite.prepare('INSERT INTO pdf_text_artifact VALUES (?, 1, ?)').run(pdf.slice(0, 64), 'artifact');
    await slice(f.host, async keys => keys.map(() => true), () => false, true);
    expect(f.pending()).toEqual([]);
  } finally { f.sqlite.close(); }
});

it('releases the read snapshot before parsing and retains edits made before the write executes', async () => {
  const f = demandFixture();
  try {
    f.insert('article');
    let snapshotReleased = false;
    let writes = 0;
    const host = { ...f.host,
      readSnapshot: async <T>(read: (db: DbPort) => Promise<T>) => {
        const value = await f.host.readSnapshot(read);
        snapshotReleased = true;
        return value;
      },
      write: async <T>(write: (db: DbPort) => Promise<T>) => {
        expect(snapshotReleased).toBe(true);
        if (++writes === 1) await f.port.run('UPDATE nodes SET content = ?', [imageBody(imageKey(2))]);
        return f.host.write(write);
      }
    };
    const { parseChangedAttachmentArticles } = await import('../../lib/core/sync/attachmentDemandQueue.js');
    await parseChangedAttachmentArticles(host, () => false);
    expect(f.pending()).toEqual([]);
    expect(f.queued()).toEqual(['article']);
    expect((await read(f)).keys).toEqual([imageKey(2)]);
  } finally { f.sqlite.close(); }
});

it('persists both queues across a process interruption and database reopening', async () => {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/t369-restart-'));
  const file = path.join(root, 'library.db');
  let f = demandFixture(file);
  try {
    f.insert('pending'); await read(f); f.insert('unparsed', imageBody(imageKey(2)));
    f.sqlite.close(); f = demandFixture(file);
    expect(f.queued()).toEqual(['unparsed']); expect(f.pending()).toEqual([imageKey(1)]);
    expect(new Set((await read(f)).keys)).toEqual(new Set([imageKey(1), imageKey(2)]));
  } finally { f.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
