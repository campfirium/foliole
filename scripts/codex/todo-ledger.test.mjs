import { describe, expect, it } from 'vitest';

import {
  completeTaskInLedger,
  isGateEntry,
  isPauseTask,
  normalizeTodoMarkdown,
  parseFirstTodoTask,
  parseTodoEntries,
  reconcileCompletedTasks,
  selectNextExecutableTodoTask,
  selectNextTodoTask,
  validateTodoEntries
} from './todo-ledger.mjs';

describe('todo-ledger helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = ['# Pending TODO', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');
    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('parses explicit task modes from todo items', () => {
    const markdown = ['# Pending TODO', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');
    expect(parseTodoEntries(markdown)).toEqual([
      { raw: '[auto] first task', task: 'first task', mode: 'auto', section: '待办' },
      { raw: '[gate] second task', task: 'second task', mode: 'gate', section: '待办' }
    ]);
  });

  it('keeps the first pending gate task as the next task', () => {
    const markdown = [
      '# Pending TODO',
      '',
      '- [ ] [gate] windows acceptance',
      '- [ ] [auto] cleanup contract',
      '- [ ] [auto] refactor storage'
    ].join('\n');

    expect(selectNextTodoTask(markdown)).toEqual({
      raw: '[gate] windows acceptance',
      task: 'windows acceptance',
      mode: 'gate',
      section: '待办'
    });
  });

  it('parses optional entries from the optional section', () => {
    const markdown = ['# Optional TODO', '', '- [ ] [auto] import fixtures', '- [ ] [auto] tighten diagnostics'].join('\n');

    expect(parseTodoEntries(markdown, '可选')).toEqual([
      { raw: '[auto] import fixtures', task: 'import fixtures', mode: 'auto', section: '可选' },
      { raw: '[auto] tighten diagnostics', task: 'tighten diagnostics', mode: 'auto', section: '可选' }
    ]);
  });

  it('falls back to the first optional auto task when mainline is blocked by a gate', () => {
    const pendingMarkdown = ['# Pending TODO', '', '- [ ] [gate] windows acceptance'].join('\n');
    const optionalMarkdown = ['# Optional TODO', '', '- [ ] [auto] import fixtures'].join('\n');

    expect(selectNextExecutableTodoTask(pendingMarkdown, optionalMarkdown)).toEqual({
      raw: '[auto] import fixtures',
      task: 'import fixtures',
      mode: 'auto',
      section: '可选'
    });
  });

  it('keeps waiting on the mainline gate when no optional auto task exists', () => {
    const pendingMarkdown = ['# Pending TODO', '', '- [ ] [gate] windows acceptance'].join('\n');
    const optionalMarkdown = ['# Optional TODO', '', '- [ ] [gate] manual follow-up'].join('\n');

    expect(selectNextExecutableTodoTask(pendingMarkdown, optionalMarkdown)).toEqual({
      raw: '[gate] windows acceptance',
      task: 'windows acceptance',
      mode: 'gate',
      section: '待办'
    });
  });

  it('treats explicit gate entries as blocking items', () => {
    expect(isGateEntry({ raw: '[gate] windows acceptance', task: 'windows acceptance', mode: 'gate' })).toBe(true);
    expect(isGateEntry({ raw: '[auto] cleanup contract', task: 'cleanup contract', mode: 'auto' })).toBe(false);
  });

  it('detects pause tasks for acceptance gates', () => {
    expect(isPauseTask('执行 Windows 客户端集成验收：在需要时单独运行 npm run windows:preview:native')).toBe(true);
    expect(isPauseTask('验收 Phase 1 退出标志：all checks green')).toBe(true);
    expect(isPauseTask('继续收口 platform bridge')).toBe(false);
  });

  it('accepts unchecked checkbox entries without an explicit execution mode', () => {
    const markdown = ['# Pending TODO', '', '- [ ] first task'].join('\n');
    expect(validateTodoEntries(markdown, 'pending')).toEqual([]);
    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('flags detached continuation lines as invalid ledger structure', () => {
    const markdown = ['# Pending TODO', '', '  Background: detached details', '- [ ] [auto] first task'].join('\n');
    expect(validateTodoEntries(markdown, 'pending')).toEqual([
      'line 3: pending continuation line is detached from any task'
    ]);
  });

  it('flags task entries that omit the unchecked checkbox marker', () => {
    const markdown = ['# Pending TODO', '', '- [auto] first task'].join('\n');
    expect(validateTodoEntries(markdown, 'pending')).toEqual([]);
    expect(normalizeTodoMarkdown(markdown)).toBe(['# Pending TODO', '', '- [ ] [auto] first task'].join('\n'));
  });

  it('accepts plain bullet entries by normalizing them to auto tasks', () => {
    const markdown = ['# Pending TODO', '', '- first task'].join('\n');
    expect(validateTodoEntries(markdown)).toEqual([]);
    expect(normalizeTodoMarkdown(markdown)).toBe(['# Pending TODO', '', '- [ ] [auto] first task'].join('\n'));
  });

  it('preserves extra bracket prefixes inside task text', () => {
    const markdown = ['# Pending TODO', '', '- [ ] [auto] [infra] first task'].join('\n');
    expect(validateTodoEntries(markdown)).toEqual([]);
    expect(parseFirstTodoTask(markdown)).toBe('[infra] first task');
  });

  it('completes the first pending auto task from the main todo list', () => {
    const result = completeTaskInLedger({
      pendingContent: ['# TODO', '', '- [ ] [auto] first task', '  Background: first details', '- [ ] [auto] second task'].join('\n'),
      optionalContent: ['# Optional', '', '- [ ] [auto] optional task'].join('\n'),
      doneContent: '# DONE\n',
      entry: { raw: '[auto] first task', task: 'first task', mode: 'auto', section: '待办' },
      note: 'automated loop completed'
    });

    expect(result.completed).toBe(true);
    expect(parseTodoEntries(result.updatedPendingContent)).toEqual([
      { raw: '[auto] second task', task: 'second task', mode: 'auto', section: '待办' }
    ]);
    expect(result.updatedPendingContent).not.toContain('Background: first details');
    expect(result.updatedDoneContent).toContain('first task; automated loop completed.');
  });

  it('throws when a completed task leaves detached details behind', () => {
    expect(() =>
      completeTaskInLedger({
        pendingContent: ['# TODO', '', '- [ ] [auto] first task', '  Background: detached details', '', '  Goal: still detached'].join('\n'),
        optionalContent: '# Optional\n',
        doneContent: '# DONE\n',
        entry: { raw: '[auto] first task', task: 'first task', mode: 'auto', section: '待办' },
        note: 'automated loop completed'
      })
    ).toThrow('invalid 待办 entries after completion');
  });

  it('completes the first optional auto task without changing the mainline todo list', () => {
    const result = completeTaskInLedger({
      pendingContent: ['# TODO', '', '- [ ] [gate] windows acceptance'].join('\n'),
      optionalContent: ['# Optional', '', '- [ ] [gate] manual follow-up', '- [ ] [auto] optional task', '- [ ] [auto] later optional'].join('\n'),
      doneContent: '# DONE\n',
      entry: { raw: '[auto] optional task', task: 'optional task', mode: 'auto', section: '可选' },
      note: 'automated loop completed'
    });

    expect(result.completed).toBe(true);
    expect(selectNextTodoTask(result.updatedPendingContent)).toEqual({
      raw: '[gate] windows acceptance',
      task: 'windows acceptance',
      mode: 'gate',
      section: '待办'
    });
    expect(parseTodoEntries(result.updatedOptionalContent, '可选')).toEqual([
      { raw: '[gate] manual follow-up', task: 'manual follow-up', mode: 'gate', section: '可选' },
      { raw: '[auto] later optional', task: 'later optional', mode: 'auto', section: '可选' }
    ]);
  });

  it('reconciles checked tasks out of todo without duplicating existing done records', () => {
    const result = reconcileCompletedTasks(
      ['# TODO', '', '- [x] [auto] first task', '  Background: first details', '- [ ] [auto] second task'].join('\n'),
      ['# DONE', '', '- [x] 2026-04-03: first task; automated loop completed.'].join('\n'),
      'checked off in ledger and reconciled automatically',
      '待办'
    );

    expect(parseTodoEntries(result.updatedContent)).toEqual([
      { raw: '[auto] second task', task: 'second task', mode: 'auto', section: '待办' }
    ]);
    expect(result.updatedContent).not.toContain('Background: first details');
    expect(result.updatedDoneContent.match(/first task/g)).toHaveLength(1);
  });

  it('reconciles checked tasks into done when no record exists yet', () => {
    const result = reconcileCompletedTasks(
      ['# TODO', '', '- [x] [auto] first task', '  Background: first details', '- [ ] [auto] second task'].join('\n'),
      '# DONE\n',
      'checked off in ledger and reconciled automatically',
      '待办'
    );

    expect(parseTodoEntries(result.updatedContent)).toEqual([
      { raw: '[auto] second task', task: 'second task', mode: 'auto', section: '待办' }
    ]);
    expect(result.updatedContent).not.toContain('Background: first details');
    expect(result.updatedDoneContent).toContain('first task; checked off in ledger and reconciled automatically.');
  });
});
