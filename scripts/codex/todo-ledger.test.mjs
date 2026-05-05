import { describe, expect, it } from 'vitest';

import { isGateEntry, isPauseTask, parseFirstTodoTask, parseTodoEntries, selectNextTodoTask, validateTodoEntries } from './todo-ledger.mjs';

describe('todo-ledger helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');
    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('parses explicit task modes from todo items', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');
    expect(parseTodoEntries(markdown)).toEqual([
      { raw: '[auto] first task', task: 'first task', mode: 'auto' },
      { raw: '[gate] second task', task: 'second task', mode: 'gate' }
    ]);
  });

  it('keeps the first pending gate task as the next task', () => {
    const markdown = [
      '# TODO',
      '',
      '## 待办',
      '',
      '- [ ] [gate] windows acceptance',
      '- [ ] [auto] cleanup contract',
      '- [ ] [auto] refactor storage'
    ].join('\n');

    expect(selectNextTodoTask(markdown)).toEqual({
      raw: '[gate] windows acceptance',
      task: 'windows acceptance',
      mode: 'gate'
    });
  });

  it('treats explicit gate entries as blocking items', () => {
    expect(isGateEntry({ raw: '[gate] windows acceptance', task: 'windows acceptance', mode: 'gate' })).toBe(true);
    expect(isGateEntry({ raw: '[auto] cleanup contract', task: 'cleanup contract', mode: 'auto' })).toBe(false);
  });

  it('detects pause tasks for acceptance gates', () => {
    expect(isPauseTask('执行 Windows 客户端集成验收：在需要时单独运行 npm run windows:preview')).toBe(true);
    expect(isPauseTask('验收 Phase 1 退出标志：all checks green')).toBe(true);
    expect(isPauseTask('继续收口 platform bridge')).toBe(false);
  });

  it('flags pending entries without an explicit execution mode', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] first task'].join('\n');
    expect(validateTodoEntries(markdown)).toEqual(['line 5: pending TODO must start with [auto] or [gate]']);
  });

  it('flags extra bracket prefixes after the execution mode', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] [auto] [infra] first task'].join('\n');
    expect(validateTodoEntries(markdown)).toEqual([
      'line 5: category tags must use plain text like "infra:" instead of extra [label] prefixes'
    ]);
  });
});
