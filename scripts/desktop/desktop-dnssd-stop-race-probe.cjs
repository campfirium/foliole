'use strict';

/* global clearTimeout, process, setTimeout */

const { app } = require('electron');
const dnsSd = require('./desktop-dnssd-harness-loader.cjs');

const base = { domain: 'local.', type: '_foliole-sync._tcp' };
const name = `FolioleStopRace-${Date.now().toString(36)}`;
const browsers = [];
let registration;
let found = 0;
let stopped = false;
let late = 0;

function stop() {
  if (stopped) return;
  stopped = true;
  registration?.cancel();
  for (const browser of browsers) browser.cancel();
  setTimeout(() => {
    if (found === 0 || late !== 0) process.exitCode = 1;
    process.stdout.write(`[desktop-dnssd-stop-race] found=${found} late=${late}\n`);
    dnsSd.browse(base, () => {});
    app.exit(process.exitCode ?? 0);
  }, 100);
}

app.whenReady().then(() => {
  for (let index = 0; index < 24; index += 1) {
    browsers.push(dnsSd.browse(base, (event) => {
      if (stopped) { late += 1; return; }
      if (event.kind === 'found' && event.service.name === name) {
        found += 1;
        browsers[index].cancel();
        if (found >= 12) stop();
      }
    }));
  }
  registration = dnsSd.register({ ...base, name, port: 38649,
    txt: { group_id: 'stop-race-probe' } }, () => {});
  const timeout = setTimeout(stop, 3_000);
  app.on('before-quit', () => clearTimeout(timeout));
});
