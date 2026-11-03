import path from 'node:path';

import { expect, type Page } from '@playwright/test';

export async function openReader(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/__reading-fonts', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionReadingFonts.tsx');
    </script></body></html>` }));
  await page.goto('/__reading-fonts');
  await expect(page.locator('.cm-content')).toContainText('AAAA');
  await page.getByRole('button', { name: 'Reading appearance' }).click();
}

export async function addFonts(page: Page, styles: string[]) {
  await page.locator('input[type=file]').setInputFiles(styles.map(style =>
    path.resolve(`tests/fixtures/fonts/Reading-${style}.otf`)));
  const confirm = page.getByRole('button', { name: 'Add fonts', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

export async function renderedWidths(page: Page) {
  return page.locator('.cm-content').evaluate(async element => {
    await document.fonts.ready;
    const family = getComputedStyle(element).fontFamily;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    return [element, element.querySelector('.cm-md-strong')!, element.querySelector('.cm-md-emphasis')!,
      element.querySelector('.cm-md-strong.cm-md-emphasis, .cm-md-strong .cm-md-emphasis, .cm-md-emphasis .cm-md-strong')!].map(span => {
      const style = getComputedStyle(span);
      context.font = `${style.fontStyle} ${style.fontWeight} 20px ${family}`;
      return context.measureText('AAAA').width;
    });
  });
}


export async function seedLegacyFont(page: Page) {
  const bytes = (await import('node:fs')).readFileSync('tests/fixtures/fonts/Reading-Regular.otf');
  const id = '12345678-1234-1234-1234-123456789abc';
  await page.evaluate(async ({ data, id }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('foliole-companion-reading-fonts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('fonts', { keyPath: 'id' });
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('fonts', 'readwrite');
        tx.objectStore('fonts').put({ id, name: 'Old reader', data: new Uint8Array(data).buffer });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    localStorage.setItem('foliole-companion-reading-typography-settings', JSON.stringify({
      fontFamily: `custom:${id}`, fontSize: 22
    }));
  }, { data: [...bytes], id });
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('AAAA');
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).filter(face =>
    face.family.startsWith('FolioleReadingFont_')).length)).toBe(1);
  return id;
}
