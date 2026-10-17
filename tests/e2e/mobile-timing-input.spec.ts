import { expect, test } from '@playwright/test';

import { replaceAndroidTimingBody } from '../../scripts/android/macos-a5-sync-timing-scenario.mjs';

for (const composing of [false, true]) {
  test(`timed replacement preserves the complete body with composing=${composing}`, async ({ page, context }) => {
    await page.setContent('<section data-companion-readable-document><div class="cm-content" contenteditable="true">Sync old text</div></section>');
    await page.evaluate(() => {
      document.addEventListener('keydown', event => {
        if (event.ctrlKey && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          window.getSelection()?.selectAllChildren(document.querySelector('.cm-content')!);
        }
      });
    });
    const editor = page.locator('.cm-content');
    await editor.focus();
    if (composing) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', {
        text: 'Sync', selectionStart: 0, selectionEnd: 0, replacementStart: 0, replacementEnd: 4
      });
    }
    await replaceAndroidTimingBody(page, 'Complete replacement');
    await expect(editor).toHaveText('Complete replacement');
  });
}
