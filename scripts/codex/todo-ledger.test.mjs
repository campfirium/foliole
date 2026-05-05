import { describe, expect, it } from 'vitest';

import { isPauseTask, parseFirstTodoTask, parseTodoEntries, selectNextTodoTask } from './todo-ledger.mjs';

describe('todo-ledger helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] first task', '- [ ] second task'].join('\n');
    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('parses explicit task modes from todo items', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] [auto] first task', '- [ ] [gate] second task'].join('\n');
    expect(parseTodoEntries(markdown)).toEqual([
      { raw: '[auto] first task', task: 'first task', mode: 'auto' },
      { raw: '[gate] second task', task: 'second task', mode: 'gate' }
    ]);
  });

  it('selects auto tasks before earlier gate tasks', () => {
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
      raw: '[auto] cleanup contract',
      task: 'cleanup contract',
      mode: 'auto'
    });
  });

  it('detects pause tasks for acceptance gates', () => {
    expect(isPauseTask('执行 Windows 客户端集成验收：在需要时单独运行 npm run windows:preview')).toBe(true);
    expect(isPauseTask('验收 Phase 1 退出标志：all checks green')).toBe(true);
    expect(isPauseTask('继续收口 platform bridge')).toBe(false);
  });
});
