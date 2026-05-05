import { describe, expect, it } from 'vitest';

import { buildCodexArgs, buildPrompt } from './codex-task.mjs';
import { parseFirstTodoTask } from './todo-ledger.mjs';

describe('codex-task helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = [
      '# TODO',
      '',
      '## 待办',
      '',
      '- [ ] first task',
      '- [ ] second task',
      '',
      '## 待验证',
      '- [ ] later task'
    ].join('\n');

    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('returns an empty task when there is no pending todo item', () => {
    const markdown = [
      '# TODO',
      '',
      '## 待办',
      '',
      '- [x] done task',
      '',
      '## 待验证'
    ].join('\n');

    expect(parseFirstTodoTask(markdown)).toBe('');
  });

  it('builds codex exec args with full-auto enabled by default', () => {
    const result = buildCodexArgs({
      task: 'ship one task',
      model: '',
      fullAuto: true,
      lastMessageFile: '/tmp/last-message.md'
    });

    expect(result.args).toContain('--full-auto');
    expect(result.args).toContain('--skip-git-repo-check');
    expect(result.args).toContain('/tmp/last-message.md');
    expect(result.prompt).toContain('ship one task');
  });

  it('builds a prompt that points the agent at repo rules', () => {
    const prompt = buildPrompt('implement one task');

    expect(prompt).toContain('Read AGENTS.md first');
    expect(prompt).toContain('Implement exactly one minimal acceptable task');
    expect(prompt).toContain('implement one task');
  });
});
