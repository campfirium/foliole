#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqlite3Driver } from '../../dist/electron/database/betterSqlite3Driver.js';
import { repairOversizedPdfBody } from '../../dist/electron/database/repairOversizedPdfBody.js';

function argument(name) {
  const value = process.argv[process.argv.indexOf(name) + 1];
  if (!process.argv.includes(name) || !value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}

function absolute(name) {
  const value = argument(name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be absolute`);
  return value;
}

async function verifyPdf(file, pdfHash) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  if (digest.digest('hex') !== pdfHash) throw new Error('pdf_body_repair_file_hash_mismatch');
}

async function backupDatabase(db, backupPath) {
  if (existsSync(backupPath)) throw new Error('Backup path already exists');
  await db.backup(backupPath);
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed');
  } finally { backup.close(); }
}

async function main() {
  const dbPath = absolute('--db-path');
  const pdfPath = absolute('--pdf-path');
  const nodeId = argument('--node-id');
  const expectedBodyHash = argument('--body-hash');
  const expectedPageCount = Number(argument('--pages'));
  const pdfHash = path.basename(pdfPath, '.pdf');
  const apply = process.argv.includes('--apply');
  if (!/^[a-f0-9]{64}$/.test(pdfHash) || !pdfPath.endsWith('.pdf') ||
      !/^[a-f0-9]{64}$/.test(expectedBodyHash) || !Number.isSafeInteger(expectedPageCount) ||
      expectedPageCount < 1) throw new Error('Invalid PDF identity, body hash, or page count');
  await verifyPdf(pdfPath, pdfHash);
  const db = new Database(dbPath, { fileMustExist: true, readonly: !apply });
  let scratch = null;
  try {
    if (!apply) scratch = await mkdtemp(path.resolve('.tmp/artifacts/pdf-body-repair-'));
    const now = new Date().toISOString();
    const backupPath = scratch ? path.join(scratch, 'dry-run.sqlite') : absolute('--backup-path');
    await backupDatabase(db, backupPath);
    const working = scratch ? new Database(backupPath, { fileMustExist: true }) : db;
    try {
      working.pragma('foreign_keys = ON');
      const source = working.prepare('SELECT last_modified_by_host_name AS host FROM nodes WHERE id = ?').get(nodeId);
      if (!source?.host) throw new Error('PDF source host not found');
      const version = repairOversizedPdfBody(createBetterSqlite3Driver(working), {
        nodeId, pdfHash, expectedBodyHash, expectedPageCount, hostName: source.host, now
      });
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', changed: version !== null, nodeId }));
    } finally { if (working !== db) working.close(); }
  } finally {
    db.close();
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

await main();
