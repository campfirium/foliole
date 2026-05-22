// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEV_RENDERER_RELOAD_DELIVERY_FILE,
  DEV_RENDERER_RELOAD_INTENT_FILE,
  DEV_RENDERER_RELOAD_INTENT_KIND,
  parseRendererReloadIntentNonce,
  writeRendererReloadIntent
} from './write-renderer-reload-intent.mjs';

describe('writeRendererReloadIntent', () => {
  it('writes a renderer reload intent with a monotonic nonce', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-reload-intent-'));
    try {
      const first = await writeRendererReloadIntent({
        head: 'head-1',
        reason: 'Class A: renderer-only sync path',
        rootDir
      });
      const second = await writeRendererReloadIntent({
        head: 'head-2',
        reason: 'Class A: renderer-only sync path',
        rootDir
      });

      const written = JSON.parse(
        await readFile(path.join(rootDir, DEV_RENDERER_RELOAD_INTENT_FILE), 'utf8')
      );

      expect(first.intent.nonce).toBe(1);
      expect(second.intent.nonce).toBe(2);
      expect(written).toMatchObject({
        kind: DEV_RENDERER_RELOAD_INTENT_KIND,
        target: 'electron-dev-renderer',
        nonce: 2,
        head: 'head-2',
        requestedBy: 'wsl-windows-preview',
        reason: 'Class A: renderer-only sync path'
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('recovers from an invalid prior contract by resetting nonce to one', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-reload-intent-'));
    try {
      await writeFile(path.join(rootDir, DEV_RENDERER_RELOAD_INTENT_FILE), '{not-json', 'utf8');

      const result = await writeRendererReloadIntent({
        head: 'head-1',
        reason: 'Class A: renderer-only sync path',
        rootDir
      });

      expect(result.intent.nonce).toBe(1);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('continues the nonce from the last delivered renderer reload intent', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-renderer-reload-intent-'));
    try {
      await writeFile(path.join(rootDir, DEV_RENDERER_RELOAD_DELIVERY_FILE), JSON.stringify({ nonce: 7 }), 'utf8');

      const result = await writeRendererReloadIntent({
        head: 'head-8',
        reason: 'Class A: renderer-only sync path',
        rootDir
      });

      expect(result.intent.nonce).toBe(8);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe('parseRendererReloadIntentNonce', () => {
  it('returns zero for invalid or negative nonce payloads', () => {
    expect(parseRendererReloadIntentNonce('not-json')).toBe(0);
    expect(parseRendererReloadIntentNonce(JSON.stringify({ nonce: -1 }))).toBe(0);
    expect(parseRendererReloadIntentNonce(JSON.stringify({ nonce: 'abc' }))).toBe(0);
  });
});
