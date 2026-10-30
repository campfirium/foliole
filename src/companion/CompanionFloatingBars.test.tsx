import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocalizationProvider, useTranslation } from '../shared/localization/LocalizationProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../shared/localization/translations';

import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

function renderBottomBar() {
  renderWithLocalization(
    <CompanionBottomTabBar
      activeAction="recent"
      activeSecondaryDestinationId={null}
      config={DEFAULT_COMPANION_TAB_CONFIG}
      onAction={vi.fn()}
      onSecondaryDestination={vi.fn()}
      visible
    />
  );
}

describe('CompanionBottomTabBar', () => {
  it('shows navigation tabs without a global transfer panel', () => {
    renderBottomBar();

    const labels = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Directory', 'Browse', 'Flow', 'Search', 'Settings']);
    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-testid', 'companion-tab-settings');
    expect(screen.queryByLabelText('Sync progress')).not.toBeInTheDocument();
  });

  it.each(['zh-Hans', 'zh-Hant'] as const)('keeps bottom navigation English in %s', async (locale) => {
    expect(await preloadTranslationCatalog(locale)).toBe(true);
    function LocalizedContent() {
      const t = useTranslation();
      return <h1>{t('companion.tabs.settings')}</h1>;
    }
    render(<LocalizationProvider initialLanguagePreference={locale}>
      <LocalizedContent />
      <CompanionBottomTabBar activeAction="recent" activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG} onAction={vi.fn()}
        onSecondaryDestination={vi.fn()} visible />
    </LocalizationProvider>);
    for (const name of ['Directory', 'Browse', 'Flow', 'Search', 'Settings']) {
      expect(screen.getByRole('button', { name })).toHaveTextContent(name);
    }
    expect(screen.getByRole('heading')).toHaveTextContent(locale === 'zh-Hans' ? '设置' : '設定');
  });

  it('uses the theme color for the active tab without a filled indicator', () => {
    renderBottomBar();

    const activeTab = document.querySelector('button[aria-current="page"]');
    expect(activeTab).not.toBeNull();
    const pill = activeTab?.querySelector('span');
    expect(pill?.className).not.toContain('bg-companion-accent-soft');
    expect(activeTab?.className).toContain('text-companion-accent');
    expect(pill?.className).toContain('rounded-full');

    const inactiveTab = screen.getByRole('button', { name: 'Flow' });
    const inactivePill = inactiveTab.querySelector('span');
    expect(inactivePill?.className ?? '').not.toContain('bg-companion-accent-soft');
  });

  it('keeps a plain WebView fallback before safe-area and focus-visible enhancements', () => {
    renderBottomBar();

    const bottomBar = screen.getByTestId('companion-bottom-tab-bar');
    expect(bottomBar.className).toContain('[height:4rem]');
    expect(bottomBar.className).toContain('[bottom:0]');
    expect(bottomBar.className).toContain('[padding-top:0.5rem]');
    expect(bottomBar.className).toContain('[padding-left:1rem]');
    expect(screen.getByRole('button', { name: 'Settings' }).className).toContain('focus:outline-none');
  });

  it('keeps tab spacing independent of flex gap support', () => {
    renderBottomBar();

    const bottomBarContent = screen.getByTestId('companion-bottom-tab-bar').firstElementChild;
    expect(bottomBarContent?.className).toContain('gap-1');
    expect(bottomBarContent?.className).toContain('[&>*+*]:ml-1');

    const settingsTab = screen.getByRole('button', { name: 'Settings' });
    expect(settingsTab.className).toContain('gap-0.5');
    expect(settingsTab.className).toContain('[&>*+*]:mt-0.5');
  });
});
