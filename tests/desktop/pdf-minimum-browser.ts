import type { Page } from '@playwright/test';

export async function maskNewPdfBuiltins(page: Page) {
  const removeNewBuiltins = () => {
    Reflect.deleteProperty(Promise, 'try');
    Reflect.deleteProperty(Math, 'sumPrecise');
    Reflect.deleteProperty(Uint8Array, 'fromBase64');
    Reflect.deleteProperty(Uint8Array.prototype, 'toBase64');
  };
  await page.addInitScript(removeNewBuiltins);
  await page.evaluate(removeNewBuiltins);
}
