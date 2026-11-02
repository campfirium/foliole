import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const TITLE = /^(Font weight|字重)$/;
const FONT = /^(Text font|正文字体)$/;
const CONTENT = '中文正文粗细变化Noto Sans SC 2026\n\n**Semantic bold**\n\n`代码Code2026`\n\n# Heading';

test('renders genuine intermediate reading weights and restores the device preference', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const settings = { 'foliole-interface-font-preset': 'noto-sans-sc', 'foliole-reading-font-weight': '400' };
    for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
    await window.electronAPI!.invoke('save_app_settings_state', { settings });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async (content) => {
    const api = window.__folioleWorkspaceDebug!;
    await api.seedNodes([{ content, id: 'reading-weight', kind: 'topic', title: 'Reading weight' }]);
    await api.openNode('reading-weight');
  }, CONTENT);
  let dialog = await openSettingsCategory(desktopWindow, 'Typography');
  await expect(dialog.getByRole('slider', { name: TITLE })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: FONT })).toContainText('Noto Sans SC');
  const artifactDir = path.resolve('.tmp/artifacts/T681');
  await mkdir(artifactDir, { recursive: true });
  const samples: Buffer[] = [];
  for (const weight of [400, 450, 500]) {
    await expect(dialog.getByRole('slider', { name: TITLE })).toBeEnabled();
    await dialog.getByRole('slider', { name: TITLE }).press('Home');
    for (let value = 100; value < weight; value += 50) await dialog.getByRole('slider', { name: TITLE }).press('ArrowRight');
    await expect.poll(() => desktopWindow.evaluate(async () => {
      const settings = await window.electronAPI!.invoke('load_app_settings_state');
      return (settings as Record<string, string>)['foliole-reading-font-weight'];
    })).toBe(String(weight));
    await desktopWindow.keyboard.press('Escape');
    const paragraph = desktopWindow.locator('.prompt-editor-host .cm-line').filter({ hasText: '中文正文粗细变化' }).first();
    await expect(paragraph).toHaveCSS('font-weight', String(weight));
    await expect(paragraph).toHaveCSS('font-family', /Foliole Noto Sans SC/);
    samples.push(await paragraph.screenshot({ path: path.join(artifactDir, `weight-${weight}.png`), caret: 'hide' }));
    await expect(desktopWindow.locator('.prompt-editor-host .cm-md-strong')).toHaveCSS('font-weight', String(Math.max(600, weight + 200)));
    await expect(desktopWindow.locator('.prompt-editor-host .cm-md-inline-code')).toHaveCSS('font-weight', '400');
    await expect(desktopWindow.locator('.prompt-editor-host .cm-line-h1')).toHaveCSS('font-weight', '700');
    dialog = await openSettingsCategory(desktopWindow, 'Typography');
  }
  expect(samples[0].equals(samples[1])).toBe(false);
  expect(samples[1].equals(samples[2])).toBe(false);
  await expectIntermediateGlyphs(desktopWindow);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  dialog = await openSettingsCategory(desktopWindow, 'Typography');
  await expect(dialog.getByRole('combobox', { name: FONT })).toContainText('Noto Sans SC');
  await expect(dialog.getByRole('slider', { name: TITLE })).toHaveValue('500');
  await expect(dialog.getByRole('slider', { name: TITLE })).toBeEnabled();
  await dialog.getByRole('slider', { name: TITLE }).press('ArrowLeft');
  await dialog.getByRole('heading', { name: /^(Reading|阅读)$/, exact: true }).click();
  await expect.poll(() => desktopWindow.evaluate(() => localStorage.getItem('foliole-reading-font-weight'))).toBe('450');
  await desktopWindow.screenshot({ path: path.join(artifactDir, 'reading-weight-settings.png') });
  await testInfo.attach('reading-weight-controls', { body: await desktopWindow.screenshot(), contentType: 'image/png' });
});

async function expectIntermediateGlyphs(desktopWindow: Page) {
  const ink = await desktopWindow.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 80;
    const context = canvas.getContext('2d')!;
    const measure = (weight: number, text: string) => {
      context.clearRect(0, 0, 800, 80);
      context.font = `${weight} 24px "Foliole Noto Sans SC"`;
      context.fillText(text, 5, 45);
      const pixels = context.getImageData(0, 0, 800, 80).data;
      let alpha = 0;
      for (let i = 3; i < pixels.length; i += 4) alpha += pixels[i]!;
      return alpha;
    };
    return ['中文正文粗细变化', 'Noto Sans SC 2026'].map((text) => [400, 450, 500].map((weight) => measure(weight, text)));
  });
  for (const [regular, intermediate, medium] of ink) {
    expect(intermediate!).toBeGreaterThan(regular!);
    expect(medium!).toBeGreaterThan(intermediate!);
  }
  const cdp = await desktopWindow.context().newCDPSession(desktopWindow);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.prompt-editor-host .cm-line' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(fonts.some((font) => font.isCustomFont && font.glyphCount > 0 && /Noto Sans SC/.test(font.familyName))).toBe(true);
  await cdp.detach();
}
