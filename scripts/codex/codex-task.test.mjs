import { describe, expect, it } from 'vitest';

import { buildCodexArgs, buildPrompt, parseTaskRequest } from './codex-task.mjs';
import { parseFirstTodoTask } from './todo-ledger.mjs';

describe('codex-task helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = [
      '# TODO',
      '',
      '## 待办',
      '',
      '- [ ] [auto] first task',
      '- [ ] [gate] second task',
      '',
      '## 待验证',
      '- [ ] [auto] later task'
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

  it('adds explicit commit-note skill trigger for commit-like requests', () => {
    const prompt = buildPrompt('执行提交指令');

    expect(prompt).toContain('Explicit skill triggers for this task:');
    expect(prompt).toContain('Use skill: commit-note');
  });

  it('adds explicit session-handoff skill trigger for exact continue requests', () => {
    const prompt = buildPrompt('继续');

    expect(prompt).toContain('Use skill: session-handoff');
  });

  it('does not map ordinary implementation tasks containing continue-like words to session-handoff', () => {
    const request = parseTaskRequest('继续收口 platform bridge');

    expect(request.skills).toEqual([]);
    expect(request.task).toBe('继续收口 platform bridge');
  });

  it('supports manual skill directives in the task text', () => {
    const request = parseTaskRequest('[skills: commit-note, session-handoff] 执行提交指令');
    const prompt = buildPrompt('[skills: commit-note, session-handoff] 执行提交指令');

    expect(request.skills).toEqual(['commit-note', 'session-handoff']);
    expect(request.task).toBe('执行提交指令');
    expect(prompt).toContain('Use skill: commit-note');
    expect(prompt).toContain('Use skill: session-handoff');
  });
});
