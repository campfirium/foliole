import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

async function openWordPressSettings(desktopWindow: import('@playwright/test').Page) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const region = dialog.getByRole('region', {
    name: /^(WordPress publish settings|WordPress 发布设置)$/
  });
  const section = region.getByRole('button', { name: 'Publish to WordPress' });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  return region;
}

test('shows the original WordPress connection error', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(() => {
    const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
    target.__wordpressConnectionOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('example.com/wp-json/wp/v2/users/me')) {
        return new Response(JSON.stringify({ code: 'incorrect_password' }), { status: 401 });
      }
      return target.__wordpressConnectionOriginalFetch!(input, init);
    };
  });

  try {
    const region = await openWordPressSettings(desktopWindow);
    await region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('https://example.com');
    await region.getByLabel(/^(WordPress username|WordPress 用户名)$/).fill('writer');
    await region.getByLabel(/^WordPress Application Password$/).fill('abcd efgh ijkl mnop qrst uvwx');
    await region.getByRole('button', { name: /^(Connect|连接)$/ }).click();

    await expect(region.getByText('WordPress Application Password authentication failed (401)')).toBeVisible();
    await expect(region.getByText(/^(Connection successful\.|连接成功。)$/)).toHaveCount(0);
    await expect(region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/)).toBeEnabled();

    const screenshot = await desktopWindow.screenshot({ fullPage: true });
    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'wordpress-connection-error-hidden-native.png');
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot);
    await testInfo.attach('wordpress-connection-error', { body: screenshot, contentType: 'image/png' });
  } finally {
    await desktopApp.evaluate(() => {
      const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
      if (target.__wordpressConnectionOriginalFetch) globalThis.fetch = target.__wordpressConnectionOriginalFetch;
      delete target.__wordpressConnectionOriginalFetch;
    });
  }
});

test('connects a bare WordPress.com address with a copied spaced password', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopApp.evaluate(() => {
    const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
    target.__wordpressConnectionOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input) === 'https://public-api.wordpress.com/rest/v1.1/sites/folioleapp.wordpress.com') {
        return new Response(JSON.stringify({ ID: 91 }), { status: 200 });
      }
      if (String(input) === 'https://folioleapp.wordpress.com/xmlrpc.php') {
        const response = `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
          <value><struct><member><name>blogid</name><value><string>91</string></value></member>
          <member><name>url</name><value><string>https://custom.example.com/</string></value></member>
          <member><name>xmlrpc</name><value><string>https://public-api.wordpress.com/xmlrpc.php</string></value></member>
          </struct></value></data></array></value></param></params></methodResponse>`;
        return new Response(response, { status: 200 });
      }
      return target.__wordpressConnectionOriginalFetch!(input, init);
    };
  });

  try {
    const region = await openWordPressSettings(desktopWindow);
    await region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/).fill('folioleapp.wordpress.com');
    await region.getByLabel(/^(WordPress username|WordPress 用户名)$/).fill('folioleapp');
    await region.getByLabel(/^WordPress Application Password$/).fill('abcd efgh ijkl mnop');
    await region.getByRole('button', { name: /^(Connect|连接)$/ }).click();

    await expect(region.getByText(/^(Connected|已连接)$/)).toBeVisible();
    await expect(region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/))
      .toHaveValue('https://folioleapp.wordpress.com');
    await expect(region.getByText(/does not provide access|无权访问/u)).toHaveCount(0);

    const screenshot = await desktopWindow.screenshot({ fullPage: true });
    const screenshotPath = path.join(process.cwd(), '.tmp', 'artifacts', 'wordpress-connection-success-hidden-native.png');
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot);
    await testInfo.attach('wordpress-connection-success', { body: screenshot, contentType: 'image/png' });
  } finally {
    await desktopApp.evaluate(() => {
      const target = globalThis as typeof globalThis & { __wordpressConnectionOriginalFetch?: typeof fetch };
      if (target.__wordpressConnectionOriginalFetch) globalThis.fetch = target.__wordpressConnectionOriginalFetch;
      delete target.__wordpressConnectionOriginalFetch;
    });
  }
});
