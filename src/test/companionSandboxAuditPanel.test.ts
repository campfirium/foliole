// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { mountCompanionSandboxAuditPanel } from '../../scripts/vite/companionSandboxAuditPanel';
import { parseCompanionSandboxAuditRows } from '../../scripts/vite/companionSandboxAuditRows';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('follows the real app destination and shows only the corresponding inventory rows', async () => {
  const markdown = [
    '| 页面 / 元素 | 点按 | 长按 | 三点或其他入口 | 审计 |',
    '| --- | --- | --- | --- | --- |',
    '| 目录根页 / 顶栏 | 捕获 | — | 更多 | 已核对 |',
    '| 搜索 / 输入与结果 | 打开 | — | — | 搜索结果 |',
    '| 同步首页 / 同步组 | 同步 | — | — | 失败反馈 |',
    '',
    '| 场景 | 整改与验证 |',
    '| --- | --- |',
    '| 历史复核 | 可追溯 |'
  ].join('\n');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => parseCompanionSandboxAuditRows(markdown) }));
  const preview = document.implementation.createHTMLDocument();
  const tab = preview.createElement('div');
  preview.body.append(tab);
  const audit = mountCompanionSandboxAuditPanel(document);
  const show = (destination: unknown[]) => {
    tab.dataset.companionPreviewDestination = JSON.stringify(destination);
    audit.show(preview);
  };

  show(['recent', 'list', null, { kind: 'root' }, true]);
  await vi.waitFor(() => expect(document.body.textContent).toContain('目录根页 / 顶栏'));
  expect(document.body.textContent).not.toContain('搜索 / 输入与结果');
  show(['search', 'list', null, { kind: 'root' }, false]);
  expect(document.body.textContent).toContain('搜索 / 输入与结果');
  expect(document.body.textContent).not.toContain('目录根页 / 顶栏');
  show(['more', 'sync', null, { kind: 'root' }, false]);
  expect(document.body.textContent).toContain('同步首页 / 同步组');
  expect(document.body.textContent).not.toContain('历史复核');
  audit.dispose();
});
