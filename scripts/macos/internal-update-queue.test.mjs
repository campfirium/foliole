import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearInternalRequests, enqueueInternalRevision, readInternalRequests,
  resolveLatestInternalRequest, waitForInternalRequests
} from './internal-update-queue.mjs';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);
const REVISION_C = 'c'.repeat(40);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('Internal update queue', () => {
  it('resets the quiet window and returns the latest pending revision', async () => {
    let currentTime = 0;
    const requests = () => [
      { requestedAt: 0, revision: REVISION_A },
      ...(currentTime >= 30 ? [{ requestedAt: 30, revision: REVISION_B }] : [])
    ];
    const result = await waitForInternalRequests('/state', {
      maxMs: 120, now: () => currentTime, pollMs: 10, quietMs: 60,
      readRequests: requests,
      sleep: async (duration) => { currentTime += duration; }
    });
    expect(currentTime).toBe(90);
    expect(result.at(-1)?.revision).toBe(REVISION_B);
  });

  it('forces a decision at the hard queue deadline', async () => {
    let currentTime = 0;
    const requests = () => [
      { requestedAt: 0, revision: REVISION_A },
      ...(currentTime >= 50 ? [{ requestedAt: 50, revision: REVISION_B }] : []),
      ...(currentTime >= 100 ? [{ requestedAt: 100, revision: REVISION_C }] : [])
    ];
    const result = await waitForInternalRequests('/state', {
      maxMs: 120, now: () => currentTime, pollMs: 10, quietMs: 60,
      readRequests: requests,
      sleep: async (duration) => { currentTime += duration; }
    });
    expect(currentTime).toBe(120);
    expect(result).toHaveLength(3);
  });

  it('prefers the descendant revision even when timestamps tie', () => {
    const run = vi.fn((_command, args) => ({
      status: args[2] === REVISION_A && args[3] === REVISION_B ? 0 : 1
    }));
    const result = resolveLatestInternalRequest([
      { requestedAt: 10, revision: REVISION_A },
      { requestedAt: 10, revision: REVISION_B }
    ], '/repo', run);
    expect(result.revision).toBe(REVISION_B);
  });

  it('persists requests atomically and clears only accounted entries', () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'foliole-internal-queue-'));
    temporaryRoots.push(stateRoot);
    enqueueInternalRevision(stateRoot, REVISION_A, 10);
    enqueueInternalRevision(stateRoot, REVISION_B, 20);
    clearInternalRequests(stateRoot, 10);
    expect(readInternalRequests(stateRoot)).toMatchObject([
      { requestedAt: 20, revision: REVISION_B }
    ]);
  });

  it('persists and validates the originating Codex thread', () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'foliole-internal-queue-'));
    temporaryRoots.push(stateRoot);
    enqueueInternalRevision(
      stateRoot, REVISION_A, 10, '019f8432-790a-7b00-8708-7500d74a56b8'
    );
    expect(readInternalRequests(stateRoot)).toMatchObject([{
      originThreadId: '019f8432-790a-7b00-8708-7500d74a56b8',
      requestedAt: 10, revision: REVISION_A
    }]);
  });

  it('persists an explicit forced package request', () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'foliole-internal-queue-'));
    temporaryRoots.push(stateRoot);
    enqueueInternalRevision(stateRoot, REVISION_A, 10, undefined, true);
    expect(readInternalRequests(stateRoot)).toMatchObject([{
      force: true, requestedAt: 10, revision: REVISION_A
    }]);
  });
});
