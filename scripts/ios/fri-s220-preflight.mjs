#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  assertFriS220ResidueFree, createFriS220Attempt
} from './fri-s220-journey-contract.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function query(databasePath, sql) {
  const uri = `file:${path.resolve(databasePath)}?immutable=1`;
  const result = spawnSync('sqlite3', ['-json', uri, sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'S220 read-only query failed.');
  return JSON.parse(result.stdout || '[]');
}

export function readFriS220MacState(databasePath) {
  const groups = query(databasePath, 'SELECT group_id FROM sync_groups ORDER BY group_id;');
  const values = query(databasePath, `SELECT id,title,content,current_version_id AS currentVersionId
    FROM nodes WHERE deleted_at IS NULL AND
    (title IN ('Multi-device sync A fact','Multi-device sync D fact') OR title LIKE 'S220 Fri %');`);
  const nodesById = Object.fromEntries(values.map((node) => [node.id, node]));
  const source = values.find((node) => node.title === 'Multi-device sync A fact');
  const conflicts = source ? query(databasePath,
    `SELECT count(*) AS count FROM node_sync_conflicts WHERE object_id='${source.id}';`)[0]?.count : null;
  return { conflicts, groupIds: groups.map(({ group_id }) => group_id), nodesById };
}

export async function inspectFriS220Preflight({ groupId, readState, receiptPath }) {
  const attempt = createFriS220Attempt(groupId);
  const state = await readState();
  if (state.groupIds.length !== 1 || state.groupIds[0] !== groupId) {
    throw new Error('S220 isolated Sync Group does not resolve exactly once.');
  }
  const source = Object.values(state.nodesById).filter((node) => node.title === attempt.sourceTitle);
  const baseline = assertFriS220ResidueFree(state, attempt, source[0]?.content ?? '');
  if (state.conflicts !== 0) throw new Error('S220 source fact already has a conflict.');
  const receipt = { attempt, baseline, groupId, resultStatus: 'ready',
    sourceVersionId: source[0]?.currentVersionId ?? null };
  if (receiptPath) writeJson(receiptPath, receipt);
  return receipt;
}

async function main() {
  const repoRoot = process.cwd();
  const groupId = process.argv[2];
  const evidenceRoot = path.resolve(process.argv[3] ?? '.tmp/artifacts/S220/fri-final-preflight');
  const databasePath = path.resolve(process.argv[4]
    ?? '.tmp/artifacts/S220/fri-native-diagnostic/shared/macos-library/Data/foliole.db');
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  await inspectFriS220Preflight({ groupId,
    readState: async () => readFriS220MacState(path.resolve(repoRoot, databasePath)), receiptPath });
  console.log(`[fri-s220-preflight] status=ready receipt=${receiptPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
