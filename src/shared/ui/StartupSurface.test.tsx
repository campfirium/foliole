import { expect, it, vi } from 'vitest';

import { renderStartupErrorView } from './StartupSurface';

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
  rootElement.querySelector<HTMLButtonElement>('button[data-variant="primary"]')?.click();
  expect(retry).toHaveBeenCalledTimes(1);
  rootElement.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
  expect(openLogs).toHaveBeenCalledTimes(1);
  rootElement.querySelectorAll<HTMLButtonElement>('button')[2]?.click();
  expect(copyDiagnostics).toHaveBeenCalledTimes(1);
  expect(rootElement.textContent).toContain('Copy diagnostics');
});
