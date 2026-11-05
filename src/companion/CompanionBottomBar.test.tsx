import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionBottomBar } from './CompanionBottomBar';
import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

it('keeps bottom navigation on the page background instead of an elevated surface', () => {
  renderWithLocalization(<CompanionBottomBar>Navigation</CompanionBottomBar>);

  expect(screen.getByRole('contentinfo')).toHaveClass('bg-companion-base');
  expect(screen.getByRole('contentinfo')).not.toHaveClass('bg-companion-content');
});

it.each(['Show answer', 'Again · Hard · Good · Easy'])(
  'keeps the %s footer on the same page background', (action) => {
    renderWithLocalization(<CompanionReviewActionFooter primary={<button>{action}</button>} />);

    expect(screen.getByRole('button', { name: action })).toBeVisible();
    expect(screen.getByRole('contentinfo')).toHaveClass('bg-companion-base');
    expect(screen.getByRole('contentinfo')).not.toHaveClass('bg-companion-content');
  }
);

it('uses the selected app language for every bottom navigation label', () => {
  render(<LocalizationProvider initialLanguagePreference="zh-Hans">
    <CompanionBottomTabBar activeAction="more" activeSecondaryDestinationId={null}
      config={DEFAULT_COMPANION_TAB_CONFIG} onAction={() => undefined}
      onSecondaryDestination={() => undefined} visible />
  </LocalizationProvider>);
  for (const name of ['目录', '浏览', 'Flow', '搜索', '设置']) {
    expect(screen.getByRole('button', { name })).toBeVisible();
  }
  expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
});
