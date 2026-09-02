function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function isDesktopRootPage(page) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 500 });
    return await page.evaluate(() =>
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
  const firstWindow = await electronApp.firstWindow({ timeout: timeoutMs });
  let lastWindow = firstWindow;
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      lastWindow = page;
      if (await isDesktopRootPage(page)) return page;
    }
    await delay(100);
  }
  const error = new Error('desktop root window was not found');
  error.windowPage = lastWindow;
  throw error;
}
