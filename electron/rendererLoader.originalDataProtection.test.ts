// @vitest-environment node
import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ locale: 'en-US' }));
vi.mock('electron', () => ({ app: { getLocale: () => runtime.locale } }));

import { loadRenderer } from './rendererLoader.js';

it.each(['en-US', 'zh-CN'])('explains protected original data on the native startup page in %s', async locale => {
  runtime.locale = locale;
  for (const code of ['fact_unbacked', 'body_unbacked', 'review_unbacked', 'relation_unbacked',
    'parents_unbacked', 'parents_invalid']) {
    const error = `legacy_sync_original_${code}${code === 'parents_invalid' ? '' : ':topic:version'}`;
    const window = { loadURL: vi.fn().mockResolvedValue(undefined) };
    await loadRenderer(window as never, '/runtime', {
      errorSummary: error, kind: 'startup-error', logPath: '/logs', moduleLabel: 'Database migration'
    });
    const html = decodeURIComponent(new URL(window.loadURL.mock.calls[0]?.[0]).pathname);
    expect(html).toContain(locale === 'zh-CN' ? '为保护资料，Foliole 已停止本次升级。'
      : 'To protect your library, Foliole has stopped this upgrade.');
    expect(html).toContain(error);
    expect(html).toContain('/logs');
  }
});

it.each(['migration <failed>', 'legacy_sync_original_unknown_unbacked:topic:version',
  'legacy_sync_original_parents_invalid_extra'])('keeps other native startup errors unchanged: %s', async error => {
  const window = { loadURL: vi.fn().mockResolvedValue(undefined) };
  await loadRenderer(window as never, '/runtime', {
    errorSummary: error, kind: 'startup-error', logPath: null, moduleLabel: 'Database migration'
  });
  const html = decodeURIComponent(new URL(window.loadURL.mock.calls[0]?.[0]).pathname);
  expect(html).not.toContain('Foliole has stopped this upgrade');
  expect(html).not.toContain('Foliole 已停止本次升级');
  expect(html).toContain(error.replace('<', '&lt;').replace('>', '&gt;'));
});
