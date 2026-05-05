import { describe, expect, it } from 'vitest';

import { isPauseTask, parseFirstTodoTask } from './todo-ledger.mjs';

describe('todo-ledger helpers', () => {
  it('parses the first pending todo item', () => {
    const markdown = ['# TODO', '', '## 待办', '', '- [ ] first task', '- [ ] second task'].join('\n');
    expect(parseFirstTodoTask(markdown)).toBe('first task');
  });

  it('detects pause tasks for acceptance gates', () => {
    expect(isPauseTask('执行 Windows 客户端集成验收：在需要时单独运行 npm run windows:preview')).toBe(true);
    expect(isPauseTask('验收 Phase 1 退出标志：all checks green')).toBe(true);
    expect(isPauseTask('继续收口 platform bridge')).toBe(false);
  });
});
