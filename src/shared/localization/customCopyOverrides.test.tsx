import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import {
  buildCustomCopyExport,
  getCustomCopyOverrides,
  setCustomCopyOverride
} from './customCopyOverrides';
import { LocalizationProvider, useTranslation } from './LocalizationProvider';

function CloseCopy() {
  const t = useTranslation();
  return <span>{t('shared.close')}</span>;
}

function ParameterizedCopy() {
  const t = useTranslation();
  return <span>{t('settings.customCopy.edit.aria', { key: 'shared.close' })}</span>;
}

beforeEach(() => window.localStorage.clear());

it('persists replacements by locale and exports only that locale changes', () => {
  setCustomCopyOverride('zh-Hans', 'shared.close', '收起');
  setCustomCopyOverride('en', 'shared.close', 'Dismiss');

  expect(getCustomCopyOverrides('zh-Hans')).toEqual({ 'shared.close': '收起' });
  expect(buildCustomCopyExport('zh-Hans')).toEqual({
    locale: 'zh-Hans',
    changes: { 'shared.close': '收起' }
  });
});

it('updates translated consumers immediately and restores the official copy', () => {
  render(<LocalizationProvider initialLanguagePreference="zh-Hans"><CloseCopy /></LocalizationProvider>);
  expect(screen.getByText('关闭')).toBeInTheDocument();

  act(() => setCustomCopyOverride('zh-Hans', 'shared.close', '收起'));
  expect(screen.getByText('收起')).toBeInTheDocument();

  act(() => setCustomCopyOverride('zh-Hans', 'shared.close', null));
  expect(screen.getByText('关闭')).toBeInTheDocument();
});

it('interpolates parameters in custom copy with the official translation semantics', () => {
  setCustomCopyOverride('zh-Hans', 'settings.customCopy.edit.aria', '编辑 {key}');
  render(<LocalizationProvider initialLanguagePreference="zh-Hans"><ParameterizedCopy /></LocalizationProvider>);

  expect(screen.getByText('编辑 shared.close')).toBeInTheDocument();
});
