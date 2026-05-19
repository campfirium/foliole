import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { setEditorDisplayMode } from '../model/editorDisplayMode';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

beforeEach(() => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  setEditorDisplayMode('preview');
});

afterEach(() => {
  document.body.innerHTML = '';
  setEditorDisplayMode('preview');
});

describe('live markdown strong rendering', () => {
  it('hides dangling note asterisks in blockquote preview', () => {
    const { adapter, host } = createAdapterHost('> \\*注：前体意味着多巴胺是用于制造肾上腺素的东西。');

    expect(host.querySelector('.cm-content')?.textContent).toBe('注：前体意味着多巴胺是用于制造肾上腺素的东西。');

    adapter.destroy();
  });

  it('hides spaced closing marks before following strong spans', () => {
    const { adapter, host } = createAdapterHost('那就是**动力 (motivation) **。 **我们将讨论快乐和奖励**，讨论**成瘾**，讨论相关的**神经化学**');

    expect(host.querySelector('.cm-content')?.textContent).toBe('那就是动力 (motivation) 。 我们将讨论快乐和奖励，讨论成瘾，讨论相关的神经化学');
    expect([...host.querySelectorAll('.cm-md-strong')].map((node) => node.textContent)).toEqual([
      '动力 (motivation) ',
      '我们将讨论快乐和奖励',
      '成瘾',
      '神经化学'
    ]);

    adapter.destroy();
  });

  it('hides adjacent CJK strong delimiters across multiple spans', () => {
    const { adapter, host } = createAdapterHost('多巴胺释放带来的**愉悦感都会稍微减少一点**。恶魔般的是，**痛苦反应却稍微增加了**。');

    expect(host.querySelector('.cm-content')?.textContent).toBe('多巴胺释放带来的愉悦感都会稍微减少一点。恶魔般的是，痛苦反应却稍微增加了。');
    expect([...host.querySelectorAll('.cm-md-strong')].map((node) => node.textContent)).toEqual([
      '愉悦感都会稍微减少一点',
      '痛苦反应却稍微增加了'
    ]);

    adapter.destroy();
  });

  it('hides imported long-link strong delimiters while keeping the link readable', () => {
    const { adapter, host } = createAdapterHost('详见**《[Chrome插件《Anki 划词制卡助手》使用说明(含视频教程)](https://link.zhihu.com/?target=https%3A//ninja33.github.io/20160817/anki-dict-helper-chrome-extension/)》**。');

    expect(host.querySelector('.cm-content')?.textContent).toBe('详见《Chrome插件《Anki 划词制卡助手》使用说明(含视频教程)》。');
    expect(host.querySelector('.cm-md-strong')?.textContent).toContain('Chrome插件');
    expect(host.querySelector('.cm-md-link-text')?.textContent).toBe('Chrome插件《Anki 划词制卡助手》使用说明(含视频教程)');

    adapter.destroy();
  });

  it('hides malformed triple-star delimiters while rendering strong text', () => {
    const { adapter, host } = createAdapterHost('***小火箭方法。 ***');

    expect(host.querySelector('.cm-md-strong')?.textContent).toBe('小火箭方法。 ');
    expect(host.querySelector('.cm-content')?.textContent).toBe('小火箭方法。 ');

    adapter.destroy();
  });
});
