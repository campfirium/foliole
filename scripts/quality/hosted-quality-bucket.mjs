#!/usr/bin/env node
/* global console, process */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertQualityCommandAllowed } from './quality-command-contracts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFINITIONS = {
  'desktop-source': {
    command: 'test:release:desktop-src',
    items: ['one', 'two', 'three', 'four']
  },
  electron: {
    command: 'test:desktop:electron',
    items: ['database', 'import', 'ipc', 'services']
  },
  tooling: {
    command: 'quality:release:tooling',
    envKey: 'FOLIOLE_QUALITY_TOOLING_SEGMENT',
    items: [
      'full', 'core-one', 'core-two', 'gate-one', 'gate-two',
      'integration-one', 'integration-two', 'node-preview'
    ]
  }
};

export function parseHostedQualityBucket(kind, value) {
  const definition = DEFINITIONS[kind];
  if (!definition) throw new Error(`Unknown hosted quality bucket kind: ${kind}`);
  let items;
  try {
    items = JSON.parse(value ?? '');
  } catch {
    throw new Error('Hosted quality bucket items must be a JSON array.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Hosted quality bucket must contain at least one item.');
  }
  if (items.some((item) => !definition.items.includes(item))) {
    throw new Error(`Hosted quality bucket contains an unknown ${kind} item.`);
  }
  if (new Set(items).size !== items.length) {
    throw new Error('Hosted quality bucket contains a duplicate item.');
  }
  return { definition, items };
}

export function runHostedQualityBucket(kind, value, runItem = runQualityItem) {
  const { definition, items } = parseHostedQualityBucket(kind, value);
  for (const item of items) runItem(definition, item);
}

function runQualityItem(definition, item) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', definition.command];
  const env = { ...process.env };
  if (definition.envKey) env[definition.envKey] = item;
  else args.push('--', item);
  const result = spawnSync(npm, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Hosted quality item failed: ${item} (exit ${result.status ?? 'signal'})`);
  }
}

function main() {
  assertQualityCommandAllowed('runner:hosted-quality-bucket');
  runHostedQualityBucket(
    process.env.FOLIOLE_HOSTED_QUALITY_BUCKET_KIND,
    process.env.FOLIOLE_HOSTED_QUALITY_BUCKET_ITEMS
  );
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
