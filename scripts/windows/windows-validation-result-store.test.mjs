// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveStaleCandidates,
  archiveValidationFailure,
  assertValidationCacheRoot,
  createValidationCandidate,
  promoteValidationCandidate,
  recoverValidationResultStore,
  writeValidationResult
} from './windows-validation-result-store.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-validation-results-'));
  roots.push(value);
  return value;
}

function complete(directory, completedAt, status = 'success') {
  writeValidationResult(directory, { completedAt, schemaVersion: 1, status });
}

describe('Windows validation result store', () => {
  it('promotes complete candidates without letting failures overwrite last-passed', () => {
    const cacheRoot = root();
    const first = createValidationCandidate(cacheRoot, 'first');
    complete(first, '2026-07-12T00:00:00.000Z');
    promoteValidationCandidate(cacheRoot, first, 'first');
    const failure = createValidationCandidate(cacheRoot, 'failure');
    complete(failure, '2026-07-12T01:00:00.000Z', 'failure');
    archiveValidationFailure(cacheRoot, failure, 'failure');
    expect(JSON.parse(fs.readFileSync(path.join(cacheRoot, 'last-passed/result.json'), 'utf8')).status).toBe('success');
  });

  it('recovers an owned backup and never deletes unknown directories', () => {
    const cacheRoot = root();
    const candidate = createValidationCandidate(cacheRoot, 'old');
    complete(candidate, '2026-07-12T00:00:00.000Z');
    fs.renameSync(candidate, path.join(cacheRoot, '.last-passed-backup-old'));
    fs.mkdirSync(path.join(cacheRoot, '.last-passed-backup-unknown'));
    recoverValidationResultStore(cacheRoot);
    expect(fs.existsSync(path.join(cacheRoot, 'last-passed/result.json'))).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, '.last-passed-backup-unknown'))).toBe(true);
  });

  it('archives only owned stale candidates', () => {
    const cacheRoot = root();
    createValidationCandidate(cacheRoot, 'stale', new Date('2026-07-01T00:00:00.000Z'));
    fs.mkdirSync(path.join(cacheRoot, 'candidate/unknown'));
    const archived = archiveStaleCandidates(cacheRoot, new Date('2026-07-12T00:00:00.000Z'));
    expect(archived).toHaveLength(1);
    expect(fs.existsSync(path.join(cacheRoot, 'candidate/unknown'))).toBe(true);
  });

  it('rejects cache roots that overlap the main database domain', () => {
    expect(() => assertValidationCacheRoot('D:\\X\\U\\Foliole\\Data\\validation', {
      FOLIOLE_MAIN_DATABASE_PATH: 'D:\\X\\U\\Foliole\\Data\\foliole.db'
    })).toThrow('overlaps protected desktop data');
  });
});
