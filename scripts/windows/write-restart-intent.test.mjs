// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEV_RESTART_DELIVERY_FILE,
  DEV_RESTART_INTENT_FILE,
  DEV_RESTART_INTENT_KIND,
  parseRestartIntentNonce,
  writeRestartIntent
} from './write-restart-intent.mjs';

describe('writeRestartIntent', () => {
  it('writes a dev restart intent with a monotonic nonce', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-restart-intent-'));
    try {
      const first = await writeRestartIntent({
        head: 'head-1',
        reason: 'Class B: working tree electron changes detected',
        rootDir
      });
      const second = await writeRestartIntent({
        head: 'head-2',
        reason: 'Class B: runtime behind committed electron changes',
        rootDir
      });

      const written = JSON.parse(
        await readFile(path.join(rootDir, DEV_RESTART_INTENT_FILE), 'utf8')
      );

      expect(first.intent.nonce).toBe(1);
      expect(second.intent.nonce).toBe(2);
      expect(written).toMatchObject({
        kind: DEV_RESTART_INTENT_KIND,
        target: 'electron-dev',
        nonce: 2,
        head: 'head-2',
        requestedBy: 'wsl-windows-preview',
        reason: 'Class B: runtime behind committed electron changes'
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('recovers from an invalid prior contract by resetting nonce to one', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-restart-intent-'));
    try {
      await writeFile(path.join(rootDir, DEV_RESTART_INTENT_FILE), '{not-json', 'utf8');

      const result = await writeRestartIntent({
        head: 'head-1',
        reason: 'Class B: working tree electron changes detected',
        rootDir
      });

      expect(result.intent.nonce).toBe(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('continues the nonce from the last delivered restart intent', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-restart-intent-'));
    try {
      await writeFile(path.join(rootDir, DEV_RESTART_DELIVERY_FILE), JSON.stringify({ nonce: 7 }), 'utf8');

      const result = await writeRestartIntent({
        head: 'head-8',
        reason: 'Class B: runtime behind committed electron changes',
        rootDir
      });

      expect(result.intent.nonce).toBe(8);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('parseRestartIntentNonce', () => {
  it('returns zero for invalid or negative nonce payloads', () => {
    expect(parseRestartIntentNonce('not-json')).toBe(0);
    expect(parseRestartIntentNonce(JSON.stringify({ nonce: -1 }))).toBe(0);
    expect(parseRestartIntentNonce(JSON.stringify({ nonce: 'abc' }))).toBe(0);
  });
});
