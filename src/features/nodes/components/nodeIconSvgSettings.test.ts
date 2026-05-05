import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { resolveNodeTreeRowCustomIcon } from './nodeIconSvgSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('does not inject pending dash styling into custom svg markup', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 12L14 4" fill="none" stroke="currentColor"/></svg>'
  );

  const result = resolveNodeTreeRowCustomIcon({ kind: 'reading', state: 'pending' });

  expect(result.markup).toContain('data-node-custom-slot="primary"');
  expect(result.markup).not.toContain('stroke-dasharray=');
});

it('drops executable svg markup before injecting the custom icon', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    `<svg viewBox="0 0 16 16">
      <script>alert(1)</script>
      <foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject>
      <path d="M2 12L14 4" onclick="alert(1)" href="javascript:alert(1)" fill="red" stroke="currentColor"/>
    </svg>`
  );

  const result = resolveNodeTreeRowCustomIcon({ kind: 'reading', state: 'pending' });

  expect(result.markup).not.toContain('<script');
  expect(result.markup).not.toContain('foreignObject');
  expect(result.markup).not.toContain('onclick');
  expect(result.markup).not.toContain('javascript:');
  expect(result.markup).not.toContain('href=');
  expect(result.markup).toContain('fill="currentColor"');
});
