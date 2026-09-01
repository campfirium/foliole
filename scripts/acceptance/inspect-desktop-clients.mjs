#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

const WORKSPACE = /^(Foliole workspace|Foliole 工作区)$/;

export function parseDesktopInspectArgs(argv, cwd = process.cwd()) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, strict: true,
    options: { 'artifact-root': { type: 'string' },
      'mac-cdp': { type: 'string', default: 'http://127.0.0.1:19224' },
      'windows-cdp': { type: 'string', default: 'http://127.0.0.1:19222' } } });
  const artifactRoot = path.resolve(values['artifact-root']
    ?? path.join(cwd, '.tmp', 'artifacts', 'client-control-inspect'));
  const clients = [
    { name: 'mac', endpoint: values['mac-cdp'] },
    { name: 'windows', endpoint: values['windows-cdp'] }
  ];
  for (const client of clients) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(client.endpoint)) {
      throw new Error(`${client.name} CDP must use loopback HTTP`);
    }
  }
  return { artifactRoot, clients };
}

function workspacePage(browser) {
  return browser.contexts()[0]?.pages().find((page) =>
    /^file:\/\/\/.*\/dist\/desktop\/index\.html(?:[?#].*)?$/u.test(page.url()));
}

export async function inspectDesktopClients(argv = process.argv.slice(2)) {
  const config = parseDesktopInspectArgs(argv);
  fs.mkdirSync(config.artifactRoot, { recursive: true });
  const results = [];
  for (const client of config.clients) {
    const browser = await chromium.connectOverCDP(client.endpoint, { timeout: 15_000 });
    try {
      const page = workspacePage(browser);
      if (!page) throw new Error(`${client.name} Foliole workspace is unavailable`);
      await page.getByRole('main', { name: WORKSPACE }).waitFor({ state: 'visible' });
      const screenshot = path.join(config.artifactRoot, `${client.name}.png`);
      await page.screenshot({ fullPage: true, path: screenshot });
      results.push({ endpoint: client.endpoint, name: client.name, screenshot,
        title: await page.title(), url: page.url() });
    } finally {
      await browser.close();
    }
  }
  const resultPath = path.join(config.artifactRoot, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify({ clients: results }, null, 2)}\n`, 'utf8');
  return { clients: results, resultPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  inspectDesktopClients().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`[inspect-desktop-clients] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
