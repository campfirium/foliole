import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCommitMessage, buildCommitNotePrompt, commitTrackedChanges, getNextCommitSequence, runCommand } from './git-state.mjs';

const tempDirs = [];
const tempRoot = path.join(process.cwd(), '.tmp', 'vitest-git-state');

function createCodexRunner(sequence, subject) {
  return async () =>
    `${sequence} ${subject}\n\ncontext: staged update prepared a repository change.\nchange: capture the staged diff in a structured commit note.\nintent: keep automated commits traceable.`;
}

async function createRepo() {
  await mkdir(tempRoot, { recursive: true });
  const repoDir = await mkdtemp(path.join(tempRoot, 'foliole-git-state-'));
  tempDirs.push(repoDir);
  await runCommand('git', ['init'], { cwd: repoDir });
  await runCommand('git', ['config', 'user.name', 'Codex Test'], { cwd: repoDir });
  await runCommand('git', ['config', 'user.email', 'codex@example.com'], { cwd: repoDir });
  return repoDir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe('git-state commitTrackedChanges', () => {
  it('waits for inherited stdout pipes to close before resolving', async () => {
    const result = await runCommand('bash', ['-lc', '(sleep 0.02; printf tail) & printf head']);
    expect(result.stdout).toBe('headtail');
  });

  it('builds commit-note prompts with explicit skill trigger and staged evidence', async () => {
    const prompt = buildCommitNotePrompt({
      sequence: '000136',
      task: 'Adjust platform bridge',
      evidence: {
        added: 12,
        deleted: 3,
        diffStat: ' src/shared/platform/bridge.ts | 15 +++++++++++++--',
        files: ['src/shared/platform/bridge.ts'],
        numstat: [{ added: 12, deleted: 3, file: 'src/shared/platform/bridge.ts' }]
      }
    });

    expect(prompt).toContain('Use skill: commit-note');
    expect(prompt).toContain('Required sequence prefix: 000136');
    expect(prompt).toContain('src/shared/platform/bridge.ts');
    expect(prompt).toContain('Task hint: adjust platform bridge');
  });

  it('builds repository-standard commit notes with next numeric sequence', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', '000135 prior subject', '-m', 'context: seed.', '-m', 'change: seed.', '-m', 'intent: seed.'], { cwd: repoDir });
    await writeFile(path.join(repoDir, 'src-task.ts'), 'export const value = 1;\n');
    await runCommand('git', ['add', 'src-task.ts'], { cwd: repoDir });

    await expect(getNextCommitSequence(repoDir)).resolves.toBe('000136');

    const message = await buildCommitMessage(repoDir, 'Adjust platform bridge', {
      codexRunner: async () =>
        '000136 adjust platform bridge\n\ncontext: bridge actions were incomplete in the staged update.\nchange: wire the staged bridge file into the runtime path.\nintent: keep platform bridge behavior aligned with the implementation.'
    });
    expect(message).toContain('000136 adjust platform bridge');
    expect(message).toContain('context: bridge actions were incomplete in the staged update.');
    expect(message).toContain('change: wire the staged bridge file into the runtime path.');
    expect(message).toContain('intent: keep platform bridge behavior aligned with the implementation.');
  });

  it('falls back to staged diff evidence when commit-note generation is unavailable', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', '000135 prior subject', '-m', 'context: seed.', '-m', 'change: seed.', '-m', 'intent: seed.'], { cwd: repoDir });
    await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
    await writeFile(path.join(repoDir, 'scripts', 'sync-bridge.mjs'), 'export const bridge = true;\n');
    await runCommand('git', ['add', 'scripts/sync-bridge.mjs'], { cwd: repoDir });

    const message = await buildCommitMessage(
      repoDir,
      '修正 agent loop 自动提交备注：对齐 `commit-note` 规范，生成 6 位编号英文 subject 和 `context/change/intent` 三行正文，而不是 `auto(task): ...`。',
      { codexRunner: async () => { throw new Error('codex unavailable'); } }
    );

    const [subject, , ...bodyLines] = message.split('\n');
    expect(subject).toMatch(/^\d{6} [a-z0-9 ]+$/);
    expect(message).not.toContain('auto(task):');
    expect(message).not.toMatch(/[\u4e00-\u9fff]/);
    expect(bodyLines[0]).toContain('context: automated loop completed');
    expect(bodyLines[1]).toContain('change: update 1 file');
    expect(bodyLines[1]).toContain('scripts/sync-bridge.mjs');
    expect(bodyLines[2]).toContain('intent: keep');
  });

  it('commits non-.lab changes without tripping ignored .lab paths', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n.tmp-vitest/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'before\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await writeFile(path.join(repoDir, 'tracked.txt'), 'after\n');
    await writeFile(path.join(repoDir, 'new.txt'), 'new\n');
    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'ignored.md'), 'ignore\n');

    await expect(
      commitTrackedChanges(repoDir, () =>
        buildCommitMessage(repoDir, 'Fix loop staging', {
          codexRunner: async () =>
            '000001 fix loop staging\n\ncontext: staged changes touched tracked and new files.\nchange: stage the tracked edit and the new file together.\nintent: keep automated staging commits traceable.'
        })
      )
    ).resolves.toBe(true);

    const stagedNames = await runCommand('git', ['show', '--pretty=', '--name-only', 'HEAD'], { cwd: repoDir });
    const subject = await runCommand('git', ['log', '-1', '--pretty=%s'], { cwd: repoDir });
    expect(stagedNames.stdout).toContain('tracked.txt');
    expect(stagedNames.stdout).toContain('new.txt');
    expect(stagedNames.stdout).not.toContain('.lab/ignored.md');
    expect(subject.stdout.trim()).toMatch(/^\d{6} /);
  });

  it('filters blocklisted temp artifacts out of untracked auto commits', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n.tmp-vitest/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'before\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await mkdir(path.join(repoDir, 'scripts'), { recursive: true });
    await writeFile(path.join(repoDir, 'scripts', 'new-task.mjs'), 'export const value = 1;\n');
    await mkdir(path.join(repoDir, '.tmp-vitest', 'node-compile-cache'), { recursive: true });
    await writeFile(path.join(repoDir, '.tmp-vitest', 'node-compile-cache', 'cache.bin'), 'cache\n');

    const message = await buildCommitMessage(repoDir, 'Add loop staging guardrails', {
      codexRunner: createCodexRunner('000001', 'add loop staging guardrails')
    });
    await expect(commitTrackedChanges(repoDir, message)).resolves.toBe(true);

    const stagedNames = await runCommand('git', ['show', '--pretty=', '--name-only', 'HEAD'], { cwd: repoDir });
    expect(stagedNames.stdout).toContain('scripts/new-task.mjs');
    expect(stagedNames.stdout).not.toContain('.tmp-vitest/node-compile-cache/cache.bin');
  });

  it('skips commit when only ignored .lab files changed', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n.tmp-vitest/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'ignored.md'), 'ignore\n');

    const message = await buildCommitMessage(repoDir, 'Fix loop staging', {
      codexRunner: createCodexRunner('000001', 'fix loop staging')
    });
    await expect(commitTrackedChanges(repoDir, message)).resolves.toBe(false);

    const headMessage = await runCommand('git', ['log', '-1', '--pretty=%s'], { cwd: repoDir });
    expect(headMessage.stdout.trim()).toBe('seed');
    const ignoredContent = await readFile(path.join(repoDir, '.lab', 'ignored.md'), 'utf8');
    expect(ignoredContent).toBe('ignore\n');
  });

  it('skips commit when only blocklisted temp artifacts exist', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n.tmp-vitest/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await mkdir(path.join(repoDir, '.tmp-vitest', 'node-compile-cache'), { recursive: true });
    await writeFile(path.join(repoDir, '.tmp-vitest', 'node-compile-cache', 'cache.bin'), 'cache\n');

    const message = await buildCommitMessage(repoDir, 'Add loop staging guardrails', {
      codexRunner: createCodexRunner('000001', 'add loop staging guardrails')
    });
    await expect(commitTrackedChanges(repoDir, message)).resolves.toBe(false);

    const headMessage = await runCommand('git', ['log', '-1', '--pretty=%s'], { cwd: repoDir });
    expect(headMessage.stdout.trim()).toBe('seed');
  });
});
