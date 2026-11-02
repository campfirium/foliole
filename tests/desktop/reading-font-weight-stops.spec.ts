import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const WEIGHT = /^(Font weight|字重)$/;

for (const weights of [[400], [400, 700]]) {
  test(`uses ${weights.length} rendered weight stops with regular centered`, async ({ desktopWindow }, testInfo) => {
    await mkdir('.tmp/artifacts/T681', { recursive: true });
    await expectWorkspaceShell(desktopWindow);
    await prepareFontFixture(desktopWindow, weights);
    const started = Date.now();
    let dialog = await openSettingsCategory(desktopWindow, 'Typography');
    let slider = dialog.getByRole('slider', { name: WEIGHT });
    await expect(dialog.getByRole('combobox', { name: /^(Text font|正文字体)$/ })).toContainText('Reading Stop Fixture');
    await expect(slider).toHaveAttribute('aria-busy', 'false');
    const detectionMs = Date.now() - started;
    await expect(slider).toHaveValue('400');
    expect(await slider.evaluate((element) => {
      const input = element as HTMLInputElement;
      return (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
    })).toBe(0.5);
    await expect(dialog.getByRole('spinbutton', { name: WEIGHT })).toHaveCount(0);
    if (weights.length === 1) {
      await expect(slider).toBeDisabled();
    } else {
      await expect(slider).toBeEnabled();
      const calls = await desktopWindow.evaluate(() => (window as typeof window & { weightLoads: number }).weightLoads);
      await slider.press('ArrowLeft');
      await expect(slider).toHaveValue('400');
      await slider.press('ArrowRight');
      await expect(slider).toHaveValue('700');
      expect(await desktopWindow.evaluate(() => (window as typeof window & { weightLoads: number }).weightLoads)).toBe(calls);
      await expect.poll(() => desktopWindow.evaluate(async () => {
        const saved = await window.electronAPI!.invoke('load_app_settings_state') as Record<string, string>;
        return saved['foliole-reading-font-weight'];
      })).toBe('700');
      await desktopWindow.keyboard.press('Escape');
      await expect(desktopWindow.locator('.prompt-editor-host .cm-line').filter({ hasText: '中文正文 Reading 2026' })).toHaveCSS('font-weight', '700');
      await desktopWindow.reload();
      await expectWorkspaceShell(desktopWindow);
      dialog = await openSettingsCategory(desktopWindow, 'Typography');
      slider = dialog.getByRole('slider', { name: WEIGHT });
      await expect(slider).toHaveAttribute('aria-busy', 'false');
      await expect(slider).toHaveValue('700');
    }
    await testInfo.attach('font-stop-detection', { body: JSON.stringify({ detectionMs, weights }), contentType: 'application/json' });
    await desktopWindow.screenshot({ path: `.tmp/artifacts/T681/reading-weight-${weights.length}-stops.png` });
  });
}

async function prepareFontFixture(desktopWindow: Page, weights: number[]) {
  const source = await desktopWindow.evaluate(() => {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSFontFaceRule) || !rule.style.fontFamily.includes('Foliole Noto Sans SC')) continue;
          const src = rule.style.getPropertyValue('src');
          return src.replace(/url\(["']?([^"')]+)["']?\)/g, (_, url: string) => `url("${new URL(url, sheet.href ?? location.href).href}")`);
        }
      }
      throw new Error('Bundled reading font not found');
    });
    await desktopWindow.addInitScript(({ source, weights }) => {
      for (const weight of weights) document.fonts.add(new FontFace('Reading Stop Fixture', source, { weight: String(weight) }));
    }, { source, weights });
    await desktopWindow.evaluate(async () => {
      const settings = {
        'foliole-interface-font-preset': 'custom', 'foliole-custom-interface-font-family': 'Reading Stop Fixture',
        'foliole-reading-font-weight': '400'
      };
      for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
      await window.electronAPI!.invoke('save_app_settings_state', { settings });
    });
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async () => {
      await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'weight-stops', kind: 'topic', title: 'Weight stops', content: '中文正文 Reading 2026' }]);
      await window.__folioleWorkspaceDebug!.openNode('weight-stops');
      const root = window as typeof window & { weightLoads?: number };
      root.weightLoads = 0;
      const load = document.fonts.load.bind(document.fonts);
      document.fonts.load = (...args) => { root.weightLoads! += 1; return load(...args); };
    });
}
