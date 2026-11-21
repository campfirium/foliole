/* global process */
// Builds throwaway git repositories for the quality-maintenance script tests.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1'
};

export function createTestRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'maintenance-repo-'));
  const run = (args, date) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) }
    }).trim();
  run(['init', '-q', '-b', 'dev']);
  const write = (filePath, content = `${filePath}\n`) => {
    const absolute = path.join(root, filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  };
  return {
    root,
    write,
    /** Writes the files and commits them; returns the full commit hash. */
    commit(message, files, date = '2026-11-01T10:00:00Z') {
      for (const [filePath, content] of Object.entries(files)) write(filePath, content);
      run(['add', '-A'], date);
      run(['commit', '-q', '-m', message], date);
      return run(['rev-parse', 'HEAD']);
    },
    tag(name, date = '2026-11-01T10:00:00Z') {
      run(['tag', name], date);
    },
    git: run,
    cleanup() {
      rmSync(root, { force: true, recursive: true });
    }
  };
}
