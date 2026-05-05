import { describe, expect, it } from 'vitest';

import { buildCommitMessage } from './git-state.mjs';
import { parseArgs } from './codex-loop.mjs';

describe('codex-loop helpers', () => {
  it('builds an english commit message fallback for non-ascii tasks', () => {
    expect(buildCommitMessage('执行 Windows 客户端集成验收')).toBe(
      'auto(task): codex loop checkpoint'
    );
  });

  it('builds a slugged commit message for ascii tasks', () => {
    expect(buildCommitMessage('Typed IPC contract cleanup')).toBe('auto(task): typed-ipc-contract-cleanup');
  });

  it('parses loop arguments', () => {
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).completeGate).toBe(true);
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).maxIterations).toBe(3);
  });
});
