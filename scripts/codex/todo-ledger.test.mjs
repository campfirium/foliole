import { describe, expect, it } from 'vitest';

import {
  isGateEntry,
  isPauseTask,
  parseFirstTodoTask,
  parseTodoEntries,
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
    expect(isPauseTask('执行 Windows 客户端集成验收：在需要时单独运行 npm run windows:preview')).toBe(true);
    expect(isPauseTask('验收 Phase 1 退出标志：all checks green')).toBe(true);
    expect(isPauseTask('继续收口 platform bridge')).toBe(false);
  });

  it('flags pending entries without an explicit execution mode', () => {
    const markdown = ['# Pending TODO', '', '- [ ] first task'].join('\n');
    expect(validateTodoEntries(markdown, 'pending')).toEqual(['line 3: pending entry must start with [auto] or [gate]']);
  });

  it('flags task entries that omit the unchecked checkbox marker', () => {
    const markdown = ['# Pending TODO', '', '- [auto] first task'].join('\n');
    expect(validateTodoEntries(markdown, 'pending')).toEqual([
      'line 3: pending entry must use unchecked checkbox format "- [ ] [auto|gate] task"'
    ]);
  });

  it('flags extra bracket prefixes after the execution mode', () => {
    const markdown = ['# Pending TODO', '', '- [ ] [auto] [infra] first task'].join('\n');
    expect(validateTodoEntries(markdown)).toEqual([
      'line 3: category tags must use plain text like "infra:" instead of extra [label] prefixes'
    ]);
  });
});
