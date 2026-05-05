import { expect, it } from 'vitest';

import { renderStartupErrorView } from './startupErrorView';

it('renders startup error messages as text content', () => {
  const rootElement = document.createElement('div');
  const message = '<img src=x onerror=alert(1)> failed';

  renderStartupErrorView(rootElement, message);

  expect(rootElement.textContent).toContain(message);
  expect(rootElement.querySelector('img')).toBeNull();
  expect(rootElement.querySelector('[onerror]')).toBeNull();
  expect(rootElement.querySelector('p')?.getAttribute('style')).toContain('rgb(var(--color-error))');
});
