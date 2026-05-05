import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCommitMessage, commitTrackedChanges, getNextCommitSequence, runCommand } from './git-state.mjs';

const tempDirs = [];
const tempRoot = path.join(process.cwd(), '.tmp-vitest-git-state');

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
  await Promise.all(tempDirs.splice(0).map((dir) => runCommand('rm', ['-rf', dir])));
});

describe('git-state commitTrackedChanges', () => {
  it('builds repository-standard commit notes with next numeric sequence', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', '000135 prior subject', '-m', 'context: seed.', '-m', 'change: seed.', '-m', 'intent: seed.'], { cwd: repoDir });

    await expect(getNextCommitSequence(repoDir)).resolves.toBe('000136');

    const message = await buildCommitMessage(repoDir, 'Adjust platform bridge');
    expect(message).toContain('000136 adjust platform bridge');
    expect(message).toContain('context: agent loop completed one automated repository task.');
    expect(message).toContain('change: apply the staged code and test updates from the latest loop iteration.');
    expect(message).toContain('intent: keep automated progress traceable with repository-standard commit notes.');
  });

  it('keeps auto commit notes in english for mixed-language tasks', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', '000135 prior subject', '-m', 'context: seed.', '-m', 'change: seed.', '-m', 'intent: seed.'], { cwd: repoDir });

    const message = await buildCommitMessage(
      repoDir,
      '修正 agent loop 自动提交备注：对齐 `commit-note` 规范，生成 6 位编号英文 subject 和 `context/change/intent` 三行正文，而不是 `auto(task): ...`。'
    );

    const [subject, , ...bodyLines] = message.split('\n');
    expect(subject).toMatch(/^\d{6} [a-z0-9 ]+$/);
    expect(message).not.toContain('auto(task):');
    expect(message).not.toMatch(/[\u4e00-\u9fff]/);
    expect(bodyLines).toEqual([
      'context: agent loop completed one automated repository task.',
      'change: apply the staged code and test updates from the latest loop iteration.',
      'intent: keep automated progress traceable with repository-standard commit notes.'
    ]);
  });

  it('commits non-.lab changes without tripping ignored .lab paths', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'before\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await writeFile(path.join(repoDir, 'tracked.txt'), 'after\n');
    await writeFile(path.join(repoDir, 'new.txt'), 'new\n');
    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'ignored.md'), 'ignore\n');

    const message = await buildCommitMessage(repoDir, 'Fix loop staging');
    await expect(commitTrackedChanges(repoDir, message)).resolves.toBe(true);

    const stagedNames = await runCommand('git', ['show', '--pretty=', '--name-only', 'HEAD'], { cwd: repoDir });
    const subject = await runCommand('git', ['log', '-1', '--pretty=%s'], { cwd: repoDir });
    expect(stagedNames.stdout).toContain('tracked.txt');
    expect(stagedNames.stdout).toContain('new.txt');
    expect(stagedNames.stdout).not.toContain('.lab/ignored.md');
    expect(subject.stdout.trim()).toMatch(/^\d{6} /);
  });

  it('skips commit when only ignored .lab files changed', async () => {
    const repoDir = await createRepo();
    await writeFile(path.join(repoDir, '.gitignore'), '.lab/\n');
    await writeFile(path.join(repoDir, 'tracked.txt'), 'seed\n');
    await runCommand('git', ['add', '.gitignore', 'tracked.txt'], { cwd: repoDir });
    await runCommand('git', ['commit', '-m', 'seed'], { cwd: repoDir });

    await mkdir(path.join(repoDir, '.lab'), { recursive: true });
    await writeFile(path.join(repoDir, '.lab', 'ignored.md'), 'ignore\n');

    const message = await buildCommitMessage(repoDir, 'Fix loop staging');
    await expect(commitTrackedChanges(repoDir, message)).resolves.toBe(false);

    const headMessage = await runCommand('git', ['log', '-1', '--pretty=%s'], { cwd: repoDir });
    expect(headMessage.stdout.trim()).toBe('seed');
    const ignoredContent = await readFile(path.join(repoDir, '.lab', 'ignored.md'), 'utf8');
    expect(ignoredContent).toBe('ignore\n');
  });
});
