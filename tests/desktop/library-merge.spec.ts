import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow, OpenDialogOptions } from 'electron';

import { createTestZip } from '../../electron/ipc/testZipBuilder';

import { expect, test } from './harness/fixtures';
import { openBackupsSection } from './harness/settings';

const SHARED = 'library-merge-shared';
const ADDED = 'library-merge-added';

test('merges another library from Settings: new notes in their own folder, a differing body as an alternative, reviews kept',
  async ({ desktopSession }, testInfo) => {
    const page = desktopSession.firstWindow;
    await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    await page.evaluate(async (id) => {
      await window.__folioleWorkspaceDebug?.seedNodes?.([{ id, kind: 'topic', title: 'Shared note', content: 'Body here' }],
        { persist: true });
    }, SHARED);
    const library = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
    if (!library) throw new Error('Missing isolated library home');
    const source = path.join(library, 'other-library.db');

    // The other library: a copy of this one where the shared note was edited and a new reviewed note was added.
    await desktopSession.electronApp.evaluate(async (_, input) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().sqlite.backup(input.source));
      const Database = require('better-sqlite3');
      const db = new Database(input.source);
      db.prepare('UPDATE nodes SET content = ?, current_version_id = NULL WHERE id = ?').run('Body there', input.shared);
      db.exec(`CREATE TEMP TABLE added AS SELECT * FROM nodes WHERE id = '${input.shared}';
        UPDATE added SET id = '${input.added}', title = 'Added note', content = 'Only there', parent_id = NULL;
        INSERT INTO nodes SELECT * FROM added;`);
      db.prepare(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
        VALUES ('merge-op', 'merge-op', 'other', ?, 3, 'fsrs-6', '2026-10-01T00:00:00.000Z', 'review', NULL)`).run(input.added);
      db.close();
    }, { source, shared: SHARED, added: ADDED });

    await desktopSession.electronApp.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async (first: BrowserWindow | OpenDialogOptions, second?: OpenDialogOptions) => {
        const options = second ?? first as OpenDialogOptions;
        return options.properties?.includes('openDirectory') ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [file] };
      };
    }, source);

    const settings = await openBackupsSection(page);
    await settings.getByRole('button', { name: /^(Choose library|选择资料库)$/ }).click();
    await expect(settings.getByText(/other-library\.db/)).toBeVisible();
    await settings.getByRole('button', { name: /^(Merge|并入)$/ }).click();
    await expect(settings.getByText(/Added 1 notes|新增 1 条资料/)).toBeVisible();
    const screenshot = await page.screenshot({ path: path.join(process.cwd(), '.tmp/artifacts/t840', 'library-merge-result.png') });
    await testInfo.attach('library-merge-result', { body: screenshot, contentType: 'image/png' });

    const facts = await desktopSession.electronApp.evaluate(async (_, ids) => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
      return connection.runWithDatabaseConnectionOwner(() => {
        const db = connection.openDatabaseConnection().sqlite;
        const added = db.prepare(`SELECT n.content, n.sync_dirty, p.title AS folder FROM nodes n JOIN nodes p ON p.id = n.parent_id
          WHERE n.id = ?`).get(ids.added);
        return {
          added,
          shared: db.prepare('SELECT content FROM nodes WHERE id = ?').get(ids.shared),
          alternative: db.prepare(`SELECT body_text FROM node_text_alternatives WHERE node_id = ? AND status = 'available'`).get(ids.shared),
          review: db.prepare('SELECT reps FROM node_review WHERE node_id = ?').get(ids.added)
        };
      });
    }, { added: ADDED, shared: SHARED });
    expect(facts.added).toMatchObject({ content: 'Only there', sync_dirty: 1 });
    expect(facts.added.folder).toMatch(/^(Merged library|并入的资料) · other-library\.db · \d{4}-\d{2}-\d{2}$/);
    expect(facts.shared).toEqual({ content: 'Body here' });
    expect(facts.alternative).toEqual({ body_text: 'Body there' });
    expect(facts.review).toEqual({ reps: 1 });
    await testInfo.attach('library-merge-facts', { body: JSON.stringify(facts), contentType: 'application/json' });
  });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1sAAAAASUVORK5CYII=', 'base64');
const PNG_KEY = `${createHash('sha256').update(PNG).digest('hex')}.png`;
const PHONE_NOTE = 'library-merge-phone-note';

test('merges a phone backup zip from Settings with the attachments inside it', async ({ desktopSession }, testInfo) => {
  const page = desktopSession.firstWindow;
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const library = desktopSession.launchOptions.env.FOLIOLE_LIBRARY_HOME;
  if (!library) throw new Error('Missing isolated library home');

  // An older phone library (v0.8.2 schema) with one reviewed note that shows an image.
  const database = await desktopSession.electronApp.evaluate(async (_, input) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const fs = process.getBuiltinModule('fs')!;
    const Database = require('better-sqlite3');
    const file = `${input.library}/phone-source.sqlite`;
    const db = new Database(file);
    db.exec(fs.readFileSync(`${process.cwd()}/electron/database/fixtures/companion-android-v0.8.2/library.sql`, 'utf8'));
    db.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, resource_references, created_at, updated_at)
      VALUES (?, NULL, 'topic', 'Phone note', ?, ?, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z')`)
      .run(input.id, `Seen on the phone ![a](asset://${input.key})`, JSON.stringify([{ storage_key: input.key, role: 'image', original_name: null }]));
    db.prepare(`INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
      VALUES ('phone-op', 'phone-op', 'v082-host', ?, 3, 'fsrs-6', '2026-10-03T00:00:00.000Z', 'review', NULL)`).run(input.id);
    db.pragma('user_version = 117');
    db.close();
    const bytes = fs.readFileSync(file).toString('base64');
    fs.rmSync(file);
    return bytes;
  }, { library, id: PHONE_NOTE, key: PNG_KEY });
  const zip = path.join(library, 'phone-backup.zip');
  await writeFile(zip, createTestZip([
    { name: 'Foliole Backup/Foliole.sqlite', content: Buffer.from(database, 'base64'), compression: 'deflate' },
    { name: `Foliole Backup/Attachments/${PNG_KEY}`, content: PNG, compression: 'deflate' }
  ]));

  await desktopSession.electronApp.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, zip);

  const settings = await openBackupsSection(page);
  await settings.getByRole('button', { name: /^(Choose library|选择资料库)$/ }).click();
  await expect(settings.getByText(/phone-backup\.zip/)).toBeVisible();
  await expect(settings.getByText(/^(Attachments are taken from inside the phone backup\.|附件直接取自手机备份。)$/)).toBeVisible();
  await expect(settings.getByRole('button', { name: /^(Choose folder|选择文件夹)$/ })).toHaveCount(0);
  await settings.getByRole('button', { name: /^(Merge|并入)$/ }).click();
  await expect(settings.getByText(/(Added 1 notes|新增 1 条资料).*(copied: 1, missing: 0|复制 1 个，缺少 0 个)/)).toBeVisible();
  const screenshot = await page.screenshot({ path: path.join(process.cwd(), '.tmp/artifacts/t840', 'library-merge-phone-result.png') });
  await testInfo.attach('library-merge-phone-result', { body: screenshot, contentType: 'image/png' });

  const facts = await desktopSession.electronApp.evaluate(async (_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return {
        note: db.prepare(`SELECT n.content, n.sync_dirty, p.title AS folder FROM nodes n JOIN nodes p ON p.id = n.parent_id
          WHERE n.id = ?`).get(id),
        review: db.prepare('SELECT reps FROM node_review WHERE node_id = ?').get(id)
      };
    });
  }, PHONE_NOTE);
  expect(facts.note).toMatchObject({ content: expect.stringContaining('Seen on the phone'), sync_dirty: 1 });
  expect(facts.note.folder).toMatch(/^(Merged library|并入的资料) · phone-backup\.zip · \d{4}-\d{2}-\d{2}$/);
  expect(facts.review).toEqual({ reps: 1 });
  await testInfo.attach('library-merge-phone-facts', { body: JSON.stringify(facts), contentType: 'application/json' });
});
