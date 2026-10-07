// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { BODY_CONTENT_CHUNK_BYTES, BODY_CONTENT_SCHEMA } from '../database/bodyContentSchema.js';

import { stageBodyContent } from './bodyContentWrite.js';
import { remapRawAnchorLinkInContent } from './syncNodeAnchorRemap.js';
import { remapRawAnchorLinkInBody } from './syncNodeAnchorRemapBody.js';
import { repairDirectChildAnchorsForAppliedParent } from './syncNodeAnchorRepair.js';

const image = `![cover](asset://${'a'.repeat(64)}.png)`;
const reference = `![cover][key]\n\n[key]: asset://${'b'.repeat(64)}.png`;
const locator = (originalText: string, from = 0, to = from + originalText.length) => ({ from, originalText, to });
const link = (value: unknown, kind = 'highlight') => JSON.stringify({ id: 'anchor', kind, locator: value });
const prefix = 'x'.repeat(BODY_CONTENT_CHUNK_BYTES - 2);

const cases: Array<[string, string]> = [
  ['aaaa', link(locator('aa', 1))], ['xaaaa', link(locator('aa'))],
  ['other', link(locator('missing'))], ['prefix😀unique', link(locator('unique'))],
  ['body', link(locator('', 99))], ['body', link(locator('dy', 2, 99))],
  ['body', link(locator('', 1e20, 1e20))],
  ['Beta Beta Gamma', link({ ranges: [locator('Beta', 0), locator('Gamma', 0)] })],
  ['Beta Beta Gamma', link({ ranges: [locator('Beta', 1), locator('missing')] })],
  ['Beta Beta Gamma', link({ ranges: [locator('Beta', 1), locator('Gamma')] })],
  ['aa aa', link({ ranges: [locator('', 0), locator('aa', 1)] })],
  [`Lead\n${image}`, link(locator(image))], [`Lead\n${image}`, link(locator(image), 'image-excerpt')],
  [`Lead\n${reference}`, link(locator(reference))],
  [`Lead\n\`\`\`\n${image}\n\`\`\``, link(locator(`\`\`\`\n${image}\n\`\`\``))],
  [`Lead\\${image}`, link(locator(`\\${image}`))],
  [`${prefix}中😀${reference}\nend`, link(locator(`中😀${reference}`))],
  [`${prefix}中😀needle${'z'.repeat(2 * BODY_CONTENT_CHUNK_BYTES)}`, link(locator('中😀needle'))],
  ['body', '{}'], ['body', JSON.stringify({ id: 'anchor', kind: 'highlight' })],
  ['body', link({ page: 1, x: 0.5, y: 0.5 })]
];

async function stage(sqlite: Database.Database, text: string) {
  for (const sql of BODY_CONTENT_SCHEMA) sqlite.exec(sql);
  const db = createBetterSqliteDbPort(sqlite);
  const data = Buffer.from(text);
  async function* chunks() {
    for (let offset = 0; offset < data.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
      yield data.subarray(offset, offset + BODY_CONTENT_CHUNK_BYTES);
    }
  }
  const body = await db.transaction((tx) => stageBodyContent(tx, {
    hash: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength, chunks: chunks()
  }));
  return { db, body };
}

it.each(cases)('matches existing anchor and image-region decisions for chunked bodies %#', async (content, value) => {
  const sqlite = new Database(':memory:');
  try {
    const { db, body } = await stage(sqlite, content);
    const input = { imageRegions: '[{"id":"original-region"}]', value };
    expect(await remapRawAnchorLinkInBody({ ...input, db, body }))
      .toEqual(remapRawAnchorLinkInContent({ ...input, content }));
  } finally { sqlite.close(); }
});

it('repairs every direct child across pages while preserving exclusions and scope', async () => {
  const sqlite = new Database(':memory:');
  try {
    const { db, body } = await stage(sqlite, 'Lead unique');
    sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, deleted_at TEXT,
      anchor_link TEXT, image_regions TEXT, anchor_resolution_status TEXT,
      anchor_source_version_id TEXT, sync_dirty INTEGER DEFAULT 0, updated_at TEXT)`);
    const insert = sqlite.prepare('INSERT INTO nodes (id, parent_id, deleted_at, anchor_link) VALUES (?, ?, ?, ?)');
    for (let index = 0; index < 70; index += 1) insert.run(`child-${String(index).padStart(2, '0')}`,
      'parent', null, link(locator('unique')));
    insert.run('deleted', 'parent', '2026-10-07', link(locator('unique')));
    insert.run('nested', 'child-00', null, link(locator('unique')));
    const result = await db.transaction((tx) => repairDirectChildAnchorsForAppliedParent({
      port: tx, content: body, parentNodeId: 'parent', sourceVersionId: 'version-2',
      excludedNodeIds: new Set(['child-34']), updatedAt: '2026-10-07T00:00:00.000Z'
    }));
    expect(result.unmapped).toEqual([]);
    expect(result.repaired).toHaveLength(69);
    expect(sqlite.prepare("SELECT count(*) AS count FROM nodes WHERE anchor_resolution_status = 'resolved'").get())
      .toEqual({ count: 69 });
    for (const id of ['child-34', 'deleted', 'nested']) {
      expect(sqlite.prepare('SELECT anchor_link FROM nodes WHERE id = ?').get(id))
        .toEqual({ anchor_link: link(locator('unique')) });
    }
  } finally { sqlite.close(); }
});
