// @vitest-environment node
/* global Response */
import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadPinned, sha256 } from './mobile-sqlcipher-sources.mjs';

describe('pinned native database build inputs', () => {
  const roots = [];
  function directory() {
    const parent = path.resolve('.tmp/artifacts/T692/source-tests');
    mkdirSync(parent, { recursive: true });
    const result = mkdtempSync(path.join(parent, 'run-'));
    roots.push(result);
    return result;
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const bytes = Buffer.from('pinned upstream input');
  const pin = { url: 'https://example.invalid/source', sha256: sha256(bytes) };
  it('accepts the exact pinned bytes and reuses them without a second network request', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal('fetch', fetch);
    const root = directory();
    const first = await downloadPinned(root, 'source.tar.gz', pin);
    expect(readFileSync(first)).toEqual(bytes);
    expect(await downloadPinned(root, 'source.tar.gz', pin)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects modified cached input instead of rebuilding from unqualified bytes', async () => {
    const root = directory();
    writeFileSync(path.join(root, 'source.tar.gz'), 'modified');
    await expect(downloadPinned(root, 'source.tar.gz', pin)).rejects.toThrow('checksum mismatch');
  });
  it('rejects wrong downloaded bytes before persisting them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unexpected')));
    await expect(downloadPinned(directory(), 'source.tar.gz', pin)).rejects.toThrow('checksum mismatch');
  });
});
