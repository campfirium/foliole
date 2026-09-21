#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertFriS220Converged } from './fri-s220-journey-contract.mjs';
import { readFriS220PostState } from './fri-s220-preflight.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function inspectFriS220Postflight({ preflight, readState, receiptPath }) {
  const state = readState(preflight.attempt, preflight.capturedAt);
  if (state.groupIds.length !== 1 || state.groupIds[0] !== preflight.groupId) {
    throw new Error('S220 postflight Sync Group identity changed.');
  }
  const source = state.nodesById[preflight.baseline.sourceId];
  const review = state.nodesById[preflight.baseline.reviewId];
  if (!source || !review) throw new Error('S220 postflight lost its baseline nodes.');
  const convergence = assertFriS220Converged(state, preflight.attempt,
    source.content, { reviewReading: preflight.baseline.reviewReading,
      sourceVersionId: preflight.sourceVersionId });
  const receipt = { attempt: preflight.attempt, convergence,
    groupId: preflight.groupId, resultStatus: 'converged' };
  if (receiptPath) writeJson(receiptPath, receipt);
  return receipt;
}

function main() {
  const repoRoot = process.cwd();
  const evidenceRoot = path.resolve(process.argv[2]
    ?? '.tmp/artifacts/S220/fri-final-postflight');
  const preflightPath = path.resolve(process.argv[3]
    ?? '.tmp/artifacts/S220/fri-final-preflight/receipt.json');
  const databasePath = path.resolve(process.argv[4]
    ?? '.tmp/artifacts/S220/fri-native-diagnostic/shared/macos-library/Data/foliole.db');
  const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
  const receiptPath = path.join(evidenceRoot, 'receipt.json');
  const receipt = inspectFriS220Postflight({ preflight,
    readState: (attempt, since) => readFriS220PostState(
      path.resolve(repoRoot, databasePath), attempt, since), receiptPath });
  console.log(`[fri-s220-postflight] status=${receipt.resultStatus} receipt=${receiptPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
