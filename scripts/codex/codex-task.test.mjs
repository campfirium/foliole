import { describe, expect, it } from 'vitest';

import { buildCodexArgs, buildPrompt, DEFAULT_CODEX_TASK_TIMEOUT_MS, parseTaskRequest, resolveCodexTaskTimeoutMs } from './codex-task.mjs';
import { parseFirstTodoTask } from './todo-ledger.mjs';

describe('codex-task helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = ['# Pending TODO', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');

    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('returns an empty task when there is no pending todo item', () => {
    const markdown = ['# Pending TODO', '', '- [x] done task'].join('\n');

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

  it('tells spawned agents to keep working when preview startup fails', () => {
    const prompt = buildPrompt('implement one task');

    expect(prompt).toContain('Treat failed verification or preview startup as unfinished work');
    expect(prompt).toContain('do not send a normal completion report');
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

  it('uses default timeout when codex task timeout input is missing or invalid', () => {
    expect(resolveCodexTaskTimeoutMs('')).toBe(DEFAULT_CODEX_TASK_TIMEOUT_MS);
    expect(resolveCodexTaskTimeoutMs('abc')).toBe(DEFAULT_CODEX_TASK_TIMEOUT_MS);
    expect(resolveCodexTaskTimeoutMs('-1')).toBe(DEFAULT_CODEX_TASK_TIMEOUT_MS);
  });

  it('accepts positive integer codex task timeout input', () => {
    expect(resolveCodexTaskTimeoutMs('60000')).toBe(60_000);
    expect(resolveCodexTaskTimeoutMs(90_000)).toBe(90_000);
  });
});
