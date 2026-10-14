import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import * as appLanguage from '../localization/appLanguage';

import { renderStartupErrorView } from './StartupSurface';

it.each(['fact_unbacked', 'body_unbacked', 'review_unbacked', 'relation_unbacked', 'parents_unbacked', 'parents_invalid'])(
  'explains original data protection for %s while retaining the raw error', (code) => {
    const rootElement = document.createElement('div');
    const message = `legacy_sync_original_${code}${code === 'parents_invalid' ? '' : ':topic-1:version-1'}`;
    renderStartupErrorView(rootElement, message);
    expect(rootElement.textContent).toContain('To protect your library, Foliole has stopped this upgrade.');
    expect(rootElement.textContent).toContain('Please copy the diagnostics and contact support.');
    expect(rootElement.textContent).toContain(message);
  }
);

it('explains original data protection in Chinese before the locale catalog is loaded', () => {
  const locale = vi.spyOn(appLanguage, 'getStoredAppLocale').mockReturnValue('zh-Hans');
  try {
    const rootElement = document.createElement('div');
    const message = 'legacy_sync_original_body_unbacked:topic-1:version-1';
    renderStartupErrorView(rootElement, message);
    expect(rootElement.textContent).toContain('为保护资料，Foliole 已停止本次升级。');
    expect(rootElement.textContent).toContain('重新启动不会补齐这些信息，请复制诊断信息并联系支持。');
    expect(rootElement.textContent).toContain(message);
  } finally {
    locale.mockRestore();
  }
});

it.each(['migration failed', 'legacy_sync_original_unknown_unbacked:topic-1:version-1',
  'legacy_sync_original_parents_invalid_extra', 'legacy_sync_original_body_unbacked_extra:topic-1:version-1'])(
  'preserves other startup errors unchanged: %s', (message) => {
    const rootElement = document.createElement('div');
    renderStartupErrorView(rootElement, message);
    expect(rootElement.querySelector('.startup-surface__message')?.textContent).toBe(message);
  }
);

it('renders startup error messages as text content', () => {
  const rootElement = document.createElement('div');
  const message = '<img src=x onerror=alert(1)> failed';

  renderStartupErrorView(rootElement, message);

  expect(rootElement.textContent).toContain(message);
  expect(rootElement.querySelector('img')).toBeNull();
  expect(rootElement.querySelector('[onerror]')).toBeNull();
  expect(rootElement.querySelector('.startup-surface__message')?.textContent).toBe(message);
});

it('renders startup diagnostics and action buttons', () => {
  const rootElement = document.createElement('div');
  const retry = vi.fn();
  const openLogs = vi.fn();
  const copyDiagnostics = vi.fn();

  renderStartupErrorView(
    rootElement,
    {
      logPath: '/logs',
      message: 'migration failed',
      moduleLabel: 'Database migration'
    },
    {
      copyDiagnostics,
      openLogs,
      retry
    }
  );

  expect(rootElement.textContent).toContain('Failed module: Database migration');
  expect(rootElement.textContent).toContain('Logs: /logs');
  rootElement.querySelector<HTMLButtonElement>('button[data-variant="emphasis"]')?.click();
  expect(retry).toHaveBeenCalledTimes(1);
  rootElement.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
  expect(openLogs).toHaveBeenCalledTimes(1);
  rootElement.querySelectorAll<HTMLButtonElement>('button')[2]?.click();
  expect(copyDiagnostics).toHaveBeenCalledTimes(1);
  expect(rootElement.textContent).toContain('Copy diagnostics');
});

it('keeps startup emphasis action aligned with the workspace shell button style', () => {
  const styles = readFileSync(join(process.cwd(), 'src/app/styles.css'), 'utf8');
  const emphasisRule = styles.slice(styles.indexOf(".startup-surface__button[data-variant='emphasis']"));
  const emphasisDeclarations = emphasisRule.split('}')[0];

  expect(emphasisDeclarations).toContain('background: transparent');
  expect(emphasisDeclarations).toContain('--color-border-strong');
  expect(emphasisDeclarations).not.toContain('color-mix');
});
