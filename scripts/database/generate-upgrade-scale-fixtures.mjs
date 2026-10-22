#!/usr/bin/env node
/* global console, process */

// Builds the frozen old-release libraries used by electron/database/libraryUpgradeScale.integration.test.ts.
// The seed runs on the tagged release's own code, so the libraries carry that release's real schema and rows.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const RELEASE = 'v0.7.14';
const FIXTURE_ROOT = path.join(ROOT, 'electron/database/fixtures/upgrade-scale');
const TEMP_ROOT = path.join(ROOT, '.tmp/upgrade-scale-fixture-generation');
const SHAPE = { books: 2, bodyKb: 4, versions: 3, imageKb: 2 };
const SCALES = [{ name: '1x', chapters: 20, images: 8 }, { name: '4x', chapters: 80, images: 32 }];

const SEED_TEST = String.raw`// @vitest-environment node
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

const out = process.env.SEED_OUT;
vi.mock('./ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(out, 'app-data'), app_cache_dir: path.join(out, 'cache'),
  app_config_dir: path.join(out, 'config'), app_log_dir: path.join(out, 'logs'),
  documents_dir: path.join(out, 'Documents')
}) }));

import { importImageAttachmentBytes } from './attachments/importImageAttachmentBytes.js';
import { closeDatabaseConnection, openDatabaseConnection } from './database/connection.js';
import { initializeDatabase } from './database/migrate.js';
import { flushAllDirtyNodeSyncVersions, upsertNodeSnapshot } from './database/nodeMutations.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
const sentence = 'The river valley shaped early agriculture, trade routes and the growth of cities across the region. ';
const env = (name) => Number(process.env[name]);
const filler = (seed, bytes) => Buffer.concat(Array.from({ length: Math.ceil(bytes / 32) },
  (_, i) => createHash('sha256').update(seed + ':' + i).digest())).subarray(0, bytes);

function chapterBody(book, chapter, round) {
  const paragraphs = ['# Book ' + book + ' Chapter ' + chapter];
  while (paragraphs.join('\n\n').length < env('SEED_BODY_KB') * 1024) {
    paragraphs.push(sentence.repeat(6) + '(' + [book, chapter, paragraphs.length, round].join('.') + ')');
  }
  return paragraphs.join('\n\n');
}

it('seeds an illustrated book library', async () => {
  initializeDatabase();
  const at = (round) => '2026-10-0' + (round + 1) + 'T00:00:00.000Z';
  const sqlite = openDatabaseConnection().sqlite;
  const save = (snapshot) => sqlite.transaction(() => upsertNodeSnapshot({ anchorLink: null, reveal: null,
    isTitleManual: true, kind: 'topic', createdAt: at(0), ...snapshot }))();
  const ids = [];
  for (let b = 0; b < env('SEED_BOOKS'); b++) {
    save({ nodeId: 'book-' + b, parentNodeId: null, title: 'book-' + b, content: '# book-' + b, position: b, updatedAt: at(0) });
    for (let c = 0; c < env('SEED_CHAPTERS'); c++) ids.push('book-' + b + '-chapter-' + String(c).padStart(4, '0'));
  }
  const links = new Map();
  for (let i = 0; i < env('SEED_IMAGES'); i++) {
    const id = ids[Math.floor((i * ids.length) / env('SEED_IMAGES'))];
    save({ nodeId: id, parentNodeId: id.replace(/-chapter-.*/, ''), title: id, content: '', position: 0, updatedAt: at(0) });
    const result = await importImageAttachmentBytes({ bytes: Buffer.concat([png, filler('image-' + i, env('SEED_IMAGE_KB') * 1024)]),
      errorSource: 'seed', mimeType: 'image/png', nodeId: id, originalName: 'figure-' + i + '.png' });
    expect(result.status).toBe('imported');
    links.set(id, [...(links.get(id) ?? []), '![figure ' + i + '](asset://' + result.storage_key + ')']);
  }
  for (let round = 0; round < env('SEED_VERSIONS'); round++) {
    ids.forEach((id, index) => {
      const [, b, c] = /^book-(\d+)-chapter-(\d+)$/.exec(id);
      save({ nodeId: id, parentNodeId: 'book-' + b, title: id, position: index, updatedAt: at(round),
        content: [chapterBody(Number(b), Number(c), round), ...(links.get(id) ?? [])].join('\n\n') });
    });
    flushAllDirtyNodeSyncVersions();
  }
  closeDatabaseConnection();
}, 600_000);
`;

function checkoutRelease(destination) {
  mkdirSync(destination, { recursive: true });
  execFileSync('sh', ['-c', `git archive ${RELEASE} | tar -x -C "${destination}"`], { cwd: ROOT, stdio: 'inherit' });
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(destination, 'node_modules'));
  writeFileSync(path.join(destination, 'electron/upgradeScaleSeed.test.ts'), SEED_TEST);
}

function copyLibrary(source, destination) {
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    if (statSync(from).isDirectory()) {
      copyLibrary(from, path.join(destination, entry));
    } else if (!/\.db-(?:wal|shm)$/u.test(entry)) {
      mkdirSync(destination, { recursive: true });
      if (entry.endsWith('.db')) writeFileSync(path.join(destination, `${entry}.gz`), gzipSync(readFileSync(from), { level: 9 }));
      else cpSync(from, path.join(destination, entry));
    }
  }
}

function main() {
  rmSync(TEMP_ROOT, { force: true, recursive: true });
  const source = path.join(TEMP_ROOT, 'source');
  checkoutRelease(source);
  rmSync(FIXTURE_ROOT, { force: true, recursive: true });
  for (const scale of SCALES) {
    const out = path.join(TEMP_ROOT, scale.name);
    execFileSync('npm', ['run', 'test:sqlite:electron', '--', 'electron/upgradeScaleSeed.test.ts'], {
      cwd: source, stdio: 'inherit',
      env: { ...process.env, SEED_OUT: out, SEED_BOOKS: String(SHAPE.books), SEED_CHAPTERS: String(scale.chapters),
        SEED_BODY_KB: String(SHAPE.bodyKb), SEED_VERSIONS: String(SHAPE.versions), SEED_IMAGES: String(scale.images),
        SEED_IMAGE_KB: String(SHAPE.imageKb) }
    });
    copyLibrary(path.join(out, 'Documents'), path.join(FIXTURE_ROOT, `${RELEASE}-${scale.name}`, 'Documents'));
  }
  const manifest = { release: RELEASE, sourceCommit: execFileSync('git', ['rev-parse', `${RELEASE}^{commit}`], {
    cwd: ROOT, encoding: 'utf8' }).trim(), shape: SHAPE, scales: SCALES,
  dataOrigin: 'deterministic synthetic book library; no user data' };
  writeFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(TEMP_ROOT, { force: true, recursive: true });
  console.log(`generated ${SCALES.length} ${RELEASE} upgrade scale libraries`);
}

main();
