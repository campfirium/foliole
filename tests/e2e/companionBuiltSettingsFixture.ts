import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

export async function loadBuiltCompanionFixture(page: Page, fixture: string, ready: Locator) {
  await page.route('**/__settings-sheets', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/${fixture}.tsx');
    </script></body></html>` }));
  await page.goto('/__settings-sheets');
  const directory = path.resolve('dist/companion/assets');
  const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
  if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
  await expect(ready).toBeVisible({ timeout: 10_000 });
  await page.locator('style:not([data-companion-custom-css])').evaluateAll(styles => styles.forEach(style => style.remove()));
  await page.addStyleTag({ content: readFileSync(path.join(directory, stylesheet), 'utf8') });
}
