'use strict';

/* global clearTimeout, process, setTimeout */

const dnsSd = require('./desktop-dnssd-harness-loader.cjs');

const name = `FolioleNativeProbe-${Date.now().toString(36)}`;
const expected = {
  device_id: 'native-probe-device',
  group_id: 'native-probe-group',
  group_tag: 'native-probe-tag'
};
const base = { domain: 'local.', type: '_foliole-sync._tcp' };
let browser;
let registration;
let resolver;
let resolveStarted = false;
let registered = false;
let found = false;
let foundService;
let resolved = false;
let lost = false;
let disposed = false;
let lateEvents = 0;
let timeout;

function matches(event) {
  return event.service?.name === name || event.service?.fqdn?.startsWith(`${name}.`);
}

function cancelAll() {
  resolver?.cancel();
  resolver?.cancel();
  registration?.cancel();
  registration?.cancel();
  browser?.cancel();
  browser?.cancel();
}

function finish(code, message) {
  clearTimeout(timeout);
  disposed = true;
  cancelAll();
  const started = Date.now();
  setTimeout(() => {
    const nonblocking = Date.now() - started < 500;
    const passed = code === 0 && lateEvents === 0 && nonblocking;
    process.stdout.write(
      `[desktop-dnssd-native-probe] status=${passed ? 'OK' : 'FAILED'} `
      + `registered=${registered} found=${found} resolve_started=${resolveStarted} `
      + `resolved=${resolved} lost=${lost} `
      + `late=${lateEvents} cancel_nonblocking=${nonblocking} ${message}\n`
    );
    process.exit(passed ? 0 : 1);
  }, 250);
}

function consumeResolve(event) {
  if (disposed) { lateEvents += 1; return; }
  if (event.kind === 'error') {
    finish(1, `resolve_error=${event.code}:${event.message}`);
    return;
  }
  if (!matches(event) || event.kind !== 'found') return;
  resolved = event.service.port === 38649 && event.service.addresses.length > 0
    && Object.entries(expected).every(([key, value]) => event.service.txt[key] === value);
  if (resolved && registered) registration.cancel();
}

function resolveWhenReady() {
  if (!registered || !found || resolver) return;
  resolveStarted = true;
  resolver = dnsSd.resolve({
    ...base, interfaceIndex: foundService.interfaceIndex, name: foundService.name
  }, consumeResolve);
}

function consumeBrowse(event) {
  if (disposed) { lateEvents += 1; return; }
  if (event.kind === 'error') {
    finish(1, `browse_error=${event.code}:${event.message}`);
    return;
  }
  if (!matches(event)) return;
  if (event.kind === 'lost') {
    lost = true;
    finish(registered && found && resolved ? 0 : 1, 'lifecycle=complete');
    return;
  }
  if (event.kind !== 'found' && event.kind !== 'changed') return;
  found = true;
  foundService = event.service;
  resolveWhenReady();
}

function consumeRegistration(event) {
  if (disposed) { lateEvents += 1; return; }
  if (event.kind === 'error') {
    finish(1, `register_error=${event.code}:${event.message}`);
    return;
  }
  if (event.kind !== 'registered') return;
  registered = true;
  resolveWhenReady();
  if (resolved) registration.cancel();
}

browser = dnsSd.browse(base, consumeBrowse);
registration = dnsSd.register({
  ...base, name, port: 38649, txt: expected
}, consumeRegistration);
timeout = setTimeout(() => finish(1,
  `timeout registered=${registered} found=${found} resolved=${resolved} lost=${lost}`),
12_000);
