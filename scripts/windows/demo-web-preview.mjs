/* global console */

import { spawn } from 'node:child_process';

import { DEMO_PREVIEW_PATH, runDevServicesCli } from './windows-dev-services.mjs';

export const PREVIEW_URL = `http://127.0.0.1:43077${DEMO_PREVIEW_PATH}`;

function openBrowser() {
  spawn('cmd.exe', ['/c', 'start', '', PREVIEW_URL], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

await runDevServicesCli(['start', 'demo']);
console.log(`[demo-web-preview] opened ${PREVIEW_URL}`);
openBrowser();
