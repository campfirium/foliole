function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function isDesktopRootPage(page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 500 });
    return page.evaluate(() =>
      globalThis.location.href !== 'about:blank' &&
      globalThis.document.readyState !== 'loading' &&
      Boolean(globalThis.document.getElementById('root'))
    );
  } catch {
    return false;
  }
}

export async function waitForDesktopRootWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  await electronApp.firstWindow({ timeout: timeoutMs });
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (await isDesktopRootPage(page)) return page;
    }
    await delay(100);
  }
  throw new Error('desktop root window was not found');
}
