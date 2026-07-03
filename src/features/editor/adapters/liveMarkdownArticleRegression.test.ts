import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => null)
}));

vi.mock('../../../shared/platform/bridge', () => ({
  openExternalUrl: vi.fn()
}));

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

describe('live markdown imported article regressions', () => {
  beforeEach(() => {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility, 'hidden');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders bracketed alt attachment images from imported social posts', async () => {
    const { adapter, host } = createAdapterHost('请教老师，![[作揖]](asset://hash-1.png)  ');

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')).toHaveAttribute('src', 'foliole-asset://attachment/hash-1');
    });
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('asset://hash-1.png');

    adapter.destroy();
  });

  it('renders empty-alt imported epub asset images without leaking the next heading marker', async () => {
    const attachmentId = '6340868bc6d7748c2c619e607ca13843234783cb1f1a3bc5bafc9c866ee6751d';
    const { adapter, host } = createAdapterHost([
      `![](asset://${attachmentId}.jpg)`,
      '',
      '**图1-1 何时使用本书**',
      '',
      '下面的章节将教给你如何准备查找bug。',
      '',
      '## **1.6 调试不仅仅是故障检修**'
    ].join('\n'));

    await waitFor(() => {
      expect(host.querySelector('.cm-md-image-element')).toHaveAttribute('src', `foliole-asset://attachment/${attachmentId}`);
    });
    expect(host.querySelector('.cm-content')?.textContent).not.toContain('asset://');
    expect(host.querySelector('.cm-line-h2 .cm-md-heading-syntax-hidden')?.textContent).toBe('## ');

    adapter.destroy();
  });

  it('hides Markdown escape backslashes in preview text', () => {
    const { adapter, host } = createAdapterHost('> \\*\\*\\*');
    const text = host.querySelector('.cm-content')?.textContent ?? '';

    expect(text).toContain('***');
    expect(text).not.toContain('\\*');

    adapter.destroy();
  });
});
