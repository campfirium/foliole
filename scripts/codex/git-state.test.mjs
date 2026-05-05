import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCommitMessage, commitTrackedChanges, getNextCommitSequence, runCommand } from './git-state.mjs';

const tempDirs = [];

async function createRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-git-state-'));
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
    expect(message).toContain('context: agent loop completed Adjust platform bridge.');
    expect(message).toContain('change: apply the staged code and test updates for Adjust platform bridge.');
    expect(message).toContain('intent: keep automated progress traceable with repository-standard commit notes.');
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
